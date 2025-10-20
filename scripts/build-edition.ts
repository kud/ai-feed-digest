#!/usr/bin/env tsx
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import process from "node:process";
import Parser from "rss-parser";
import YAML from "yaml";
import { htmlToText } from "html-to-text";
import { z } from "zod";
import ora, { type Ora } from "ora";
import { generateBriefingDocument, generateEditionNarrative, summariseWithOC, warmupOpenCodeClient, getSummaryMetrics } from "../src/summarise-with-oc";
import { detectLanguage } from "../src/opencode-prompt";
import { loadEditionByDate } from "@/lib/load-edition";
import {
  DigestConfig,
  EditionBriefing,
  EditionItem,
  EditionNarrativeItem,
  EditionSource,
  EditionDocument,
  SummariseInput
} from "../src/lib/types";
import { EDITIONS_DIR, CONFIG_PATH, FEEDS_CONFIG_PATH, SEEN_CACHE_PATH, SUMMARY_METRICS_PATH } from "../src/lib/constants";

const rssParser = new Parser({
  timeout: 10_000,
  headers: {
    "User-Agent": "rss-digest/0.1 (+https://github.com/)"
  }
});

const COLORS = {
  reset: "\x1b[0m",
  info: "\x1b[36m",
  success: "\x1b[32m",
  warn: "\x1b[33m",
  detail: "\x1b[90m"
} as const;

const GLYPHS = {
  edition: "◆",
  feed: "→",
  summary: "✦",
  article: "•",
  opencode: "⚡",
  success: "✓",
  warn: "⚠",
  info: "ℹ",
  folder: "▸",
  stats: "≡",
  timer: "⏱",
  window: "⌚"
} as const;

const CURATED_HOSTS = [
  "lemonde.fr",
  "liberation.fr",
  "reuters.com",
  "apnews.com",
  "associatedpress.com",
  "futura-sciences.com",
  "france24.com",
  "bbc.co.uk",
  "bbc.com",
  "theguardian.com",
  "nytimes.com",
  "washingtonpost.com",
  "financialtimes.com",
  "ft.com",
  "politico.eu",
  "lefigaro.fr",
  "mediapart.fr",
  "lesechos.fr",
  "euronews.com",
  "latribune.fr",
  "sciencesetavenir.fr"
];

const MARKETING_HOSTS = [
  "producthunt.com",
  "github.com",
  "medium.com",
  "substack.com",
  "dev.to",
  "hashnode.com"
];

const MARKETING_KEYWORDS = [/product\s*hunt/i, /github/i, /app\s*launch/i, /beta\s*launch/i, /product\s*update/i];

const MIN_VALID_ARTICLES = 5;
const MAX_MARKETING_RATIO = 0.4;
const MAX_BRIEFING_ATTEMPTS = 2;

// Concurrency for AI summaries (override with env SUMMARY_CONCURRENCY=5 etc.)
const SUMMARY_CONCURRENCY = (() => {
  const v = Number(process.env.SUMMARY_CONCURRENCY);
  if (Number.isFinite(v) && v >= 1) return Math.min(v, 10);
  return 3; // default
})();
// Concurrency for article hydration (env HYDRATE_CONCURRENCY=8 etc.)
const HYDRATE_CONCURRENCY = (() => {
  const v = Number(process.env.HYDRATE_CONCURRENCY);
  if (Number.isFinite(v) && v >= 1) return Math.min(v, 12);
  return 6; // default
})();
// Per-domain hydration concurrency to avoid hammering a single host (env HYDRATE_PER_DOMAIN_CONCURRENCY=2 etc.)
const HYDRATE_PER_DOMAIN_CONCURRENCY = (() => {
  const v = Number(process.env.HYDRATE_PER_DOMAIN_CONCURRENCY);
  if (Number.isFinite(v) && v >= 1) return Math.min(v, 3);
  return 1; // safest default
})();
// Concurrency for RSS feed fetching (env FEED_CONCURRENCY=10 etc.)
const FEED_CONCURRENCY = (() => {
  const v = Number(process.env.FEED_CONCURRENCY);
  if (Number.isFinite(v) && v >= 1) return Math.min(v, 16);
  return 6; // default
})();

function normaliseHost(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.startsWith("www.") ? host.slice(4) : host;
  } catch {
    return null;
  }
}

function isCuratedHost(host: string | null): boolean {
  if (!host) return false;
  return CURATED_HOSTS.some((curated) => host === curated || host.endsWith(`.${curated}`));
}

function isMarketingHost(host: string | null): boolean {
  if (!host) return false;
  return MARKETING_HOSTS.some((mk) => host === mk || host.endsWith(`.${mk}`));
}

function isMarketingContent(text: string): boolean {
  const sample = text.toLowerCase();
  return MARKETING_KEYWORDS.some((regex) => regex.test(sample));
}

function logInfo(icon: string, message: string) {
  console.log(`${COLORS.info}${icon}${COLORS.reset} ${message}`);
}

function logDetail(icon: string, message: string) {
  console.log(`${COLORS.detail}${icon}${COLORS.reset} ${message}`);
}

function logSuccess(message: string) {
  console.log(`${COLORS.success}${GLYPHS.success}${COLORS.reset} ${message}`);
}

function logWarn(message: string) {
  console.warn(`${COLORS.warn}${GLYPHS.warn}${COLORS.reset} ${message}`);
}

const configSchema = z.object({
  timezone: z.string(),
  language: z.string().default("fr"),
  digest: z.object({
    hour: z.number().int().min(0).max(23),
    minute: z.number().int().min(0).max(59),
    max_articles_per_feed: z.number().int().min(1).max(20),
    max_chars_per_summary: z.number().int().min(120).max(1200),
    min_chars_per_summary: z.number().int().min(80).max(600)
  }),
  opencode: z.object({
    model: z.string(),
    agent: z.string().nullable(),
    timeout_ms: z.number().int().min(1).max(120_000)
  }),
  thematic_order: z.boolean().optional().default(false)
});

const feedsSchema = z.object({
  feeds: z
    .array(
      z.object({
        title: z.string(),
        url: z.string().url(),
        tags: z.array(z.string()).optional()
      })
    )
    .min(1)
});

type SeenCache = Set<string>;

interface PendingStory {
  feedTitle: string;
  feedUrl: string;
  item: {
    title: string;
    url: string;
    publishedAt: string;
    rawContent: string;
  };
  bucket: EditionItem[];
  text?: string;
}

interface CollectionWindow {
  start: Date;
  end: Date;
}

async function main() {
  const startTime = Date.now();
  let spinner: Ora | null = null;

  // Ensure warnings / errors appear on their own line when spinner is active
  const originalWarn = console.warn.bind(console);
  console.warn = (...args: any[]) => {
    if (spinner && spinner.isSpinning) {
      // Move to a fresh line before printing the warning so it doesn't share spinner line
      process.stdout.write('\n');
    }
    originalWarn(...args);
  };
  const originalError = console.error.bind(console);
  console.error = (...args: any[]) => {
    if (spinner && spinner.isSpinning) {
      process.stdout.write('\n');
    }
    originalError(...args);
  };
  
  try {
    await fs.mkdir(path.dirname(SEEN_CACHE_PATH), { recursive: true });
    await fs.mkdir(EDITIONS_DIR, { recursive: true });

    const editionDate = resolveEditionDate();
    const targetEditionPath = path.join(EDITIONS_DIR, `${editionDate}.md`);
    const forceRegeneration = await pathExists(targetEditionPath);
    
    spinner = ora(`Loading configuration...`).start();
    const config = await loadConfig();
    spinner.succeed(`Configuration loaded (${config.feeds.length} feeds, model: ${config.opencode.model})`);
    
    if (forceRegeneration) {
      console.log(`${COLORS.detail}${GLYPHS.info} Existing edition detected, regenerating...${COLORS.reset}`);
    }
    
    spinner = ora(`Loading seen cache...`).start();
    const seen = await loadSeenCache();
    spinner.succeed(`Seen cache loaded (${seen.size} articles tracked)`);

    const collectionWindow = resolveCollectionWindow(editionDate, config.digest, config.timezone);
    console.log(
      `${COLORS.detail}${GLYPHS.window} Collection window: ${formatInTimezone(collectionWindow.start, config.timezone)} → ${formatInTimezone(collectionWindow.end, config.timezone)} (${config.timezone})${COLORS.reset}`
    );

    const sources: EditionSource[] = [];
    const narrativeStories: EditionNarrativeItem[] = [];
    const pendingStories: PendingStory[] = [];
    const qaFlags: string[] = [];
    let marketingFiltered = 0;
    let nonCuratedFiltered = 0;
    let totalCandidateItems = 0;

    spinner = ora(`Fetching RSS feeds (0/${config.feeds.length})`).start();
    let feedsProcessed = 0;
    let totalFreshItems = 0;

    // Fetch feeds concurrently, but build pendingStories afterward in deterministic feed order.
    interface FeedResult { freshItems: ReturnType<typeof pickFreshItems>; feedDead: boolean; rawCount: number; }
    const feedResults: FeedResult[] = new Array(config.feeds.length);

    await runPool(config.feeds, FEED_CONCURRENCY, async (feed, idx) => {
      let feedItems: Awaited<ReturnType<typeof fetchFeedItems>> = [];
      let freshItems: ReturnType<typeof pickFreshItems> = [];
      let feedDead = false;
      try {
        if (spinner) spinner.text = `Fetching "${feed.title}" (${feedsProcessed + 1}/${config.feeds.length})`;
        feedItems = await fetchFeedItems(feed.url);
        freshItems = pickFreshItems(feedItems, seen, collectionWindow, config.digest.max_articles_per_feed, { ignoreSeen: forceRegeneration });
        const feedAllowsTechFocus = (feed.tags || []).some((tag) => tag.toLowerCase() === "tech focus day");
        freshItems = freshItems.filter((item) => {
          totalCandidateItems++;
          const host = normaliseHost(item.url);
          if (!isCuratedHost(host)) {
            nonCuratedFiltered++;
            return false;
          }
          const marketingHost = isMarketingHost(host);
          const marketingText = isMarketingContent(`${item.title} ${item.rawContent}`);
          if (!feedAllowsTechFocus && (marketingHost || marketingText)) {
            marketingFiltered++;
            return false;
          }
          return true;
        });
      } catch (error) {
        feedDead = true;
      } finally {
        feedsProcessed++;
        totalFreshItems += freshItems.length;
        feedResults[idx] = { freshItems, feedDead, rawCount: feedItems.length };
        if (spinner) spinner.text = `Fetching RSS feeds (${feedsProcessed}/${config.feeds.length}) - ${totalFreshItems} new items`;
        if (feedDead) {
          console.log(`  ${COLORS.warn}${GLYPHS.warn} Feed appears dead: "${feed.title}"${COLORS.reset}`);
        }
      }
    });

    // Build pending stories in original feed list order for deterministic downstream ordering.
    feedResults.forEach((result, idx) => {
      const feed = config.feeds[idx];
      if (!result || result.freshItems.length === 0) return;
      const bucket: EditionItem[] = [];
      sources.push({ feed: feed.title, items: bucket });
      for (const item of result.freshItems) {
        pendingStories.push({
          feedTitle: feed.title,
          feedUrl: feed.url,
          item,
            bucket
        });
      }
    });
    spinner.succeed(`Fetched ${config.feeds.length} feeds - found ${totalFreshItems} new items`);
    if (nonCuratedFiltered > 0) {
      console.log(`${COLORS.detail}${GLYPHS.info} Skipped ${nonCuratedFiltered} articles from non-curated hosts${COLORS.reset}`);
    }
    if (marketingFiltered > 0) {
      console.log(`${COLORS.detail}${GLYPHS.info} Filtered ${marketingFiltered} marketing/Product Hunt style articles${COLORS.reset}`);
    }
    if (totalCandidateItems > 0 && marketingFiltered / totalCandidateItems > MAX_MARKETING_RATIO) {
      qaFlags.push("More than 40% of fetched articles were filtered as marketing-oriented.");
    }

    if (pendingStories.length === 0) {
      console.log(`${COLORS.warn}${GLYPHS.warn} No new items found. Edition not created.${COLORS.reset}`);
      return;
    }

    if (pendingStories.length < MIN_VALID_ARTICLES) {
      const fallbackEdition = await loadFallbackEdition(editionDate);
      if (fallbackEdition) {
        console.log(`${COLORS.warn}${GLYPHS.info} Not enough curated items today; falling back to edition ${fallbackEdition.slug}.${COLORS.reset}`);
        await writeFallbackEdition(editionDate, fallbackEdition);
        return;
      }
      console.log(`${COLORS.warn}${GLYPHS.warn} Less than ${MIN_VALID_ARTICLES} curated articles found and no fallback edition available.${COLORS.reset}`);
      qaFlags.push("Not enough curated articles to meet editorial target.");
    }

    spinner = ora(`Fetching full article content (0/${pendingStories.length})`).start();
    await hydrateArticleTexts(pendingStories, config, spinner);
    spinner.succeed(`Retrieved full content for ${pendingStories.length} articles`);

    spinner = ora(`Initializing AI connection (model: ${config.opencode.model})`).start();
    await warmupOpenCodeClient(config);
    spinner.succeed(`AI connection ready`);

    spinner = ora(`Generating AI summaries (0/${pendingStories.length})`).start();
    await summariseStories(pendingStories, config, seen, narrativeStories, spinner);
    spinner.succeed(`Generated ${pendingStories.length} AI summaries`);

    // Optional thematic reordering of narrative stories
    if (config.thematic_order) {
      const tagPriorityMap: Record<string, number> = {
        news: 0,
        hard: 0,
        politics: 1,
        economy: 2,
        business: 3,
        tech: 10,
        coding: 11,
        developer: 11,
        ai: 9,
        science: 8,
        design: 15,
        ux: 16,
        culture: 22,
        discover: 23,
        fashion: 24,
        lifestyle: 25,
        games: 30,
        gaming: 30,
        deals: 34
      };
      const feedTags = new Map<string, string[]>();
      for (const feed of config.feeds) {
        if (feed.tags && feed.tags.length) {
          feedTags.set(feed.title, feed.tags.map(t => t.toLowerCase()));
        }
      }
      const originalOrder = new Map(narrativeStories.map((s, i) => [s.url, i] as const));
      narrativeStories.sort((a, b) => {
        const aTags = feedTags.get(a.feed) || [];
        const bTags = feedTags.get(b.feed) || [];
        const aScore = aTags.length ? Math.min(...aTags.map(t => tagPriorityMap[t] ?? 50)) : 50;
        const bScore = bTags.length ? Math.min(...bTags.map(t => tagPriorityMap[t] ?? 50)) : 50;
        if (aScore !== bScore) return aScore - bScore;
        return (originalOrder.get(a.url)! - originalOrder.get(b.url)!);
      });
      if (process.env.NODE_ENV !== 'production') {
        const buckets: Record<string, number> = {};
        for (const story of narrativeStories) {
          const tags = feedTags.get(story.feed) || ['(none)'];
            const best = tags.slice().sort((x, y) => (tagPriorityMap[x] ?? 50) - (tagPriorityMap[y] ?? 50))[0];
          buckets[best] = (buckets[best] || 0) + 1;
        }
        console.log(`${COLORS.detail}${GLYPHS.info} thematic-order buckets ${Object.entries(buckets).map(([k,v])=>`${k}=${v}`).join(' ')}${COLORS.reset}`);
      }
    }

    const sourcesWithContent = sources.filter((source) => source.items.length > 0);
    if (sourcesWithContent.length === 0) {
      console.log(`${COLORS.warn}${GLYPHS.warn} Article text resolution failed. Edition not created.${COLORS.reset}`);
      return;
    }

    const totalItems = sourcesWithContent.reduce((acc, source) => acc + source.items.length, 0);
    const distinctFeeds = new Set(sourcesWithContent.map((source) => source.feed));
    if (distinctFeeds.size < 6) {
      qaFlags.push("Fewer than six distinct sources after filtering");
    }

    if (narrativeStories.length > 0) {
      const marketingSourceCount = narrativeStories.filter((story) => isMarketingHost(normaliseHost(story.url))).length;
      if (marketingSourceCount / narrativeStories.length > MAX_MARKETING_RATIO) {
        qaFlags.push("More than 40% of sources originate from marketing-oriented domains");
      }
    }

    let briefing: EditionBriefing | null = null;
    let lastCandidate: EditionBriefing | null = null;
    let qaResult: { warnings: string[]; errors: string[] } = { warnings: [], errors: [] };
    for (let attempt = 1; attempt <= MAX_BRIEFING_ATTEMPTS; attempt++) {
      spinner = ora(`Generating long-form briefing (attempt ${attempt}/${MAX_BRIEFING_ATTEMPTS})...`).start();
      const candidate = await generateBriefingDocument(narrativeStories, config, attempt);
      spinner.succeed(`Briefing document generated (~${candidate.readingMinutes} min read, ${candidate.wordCount} words)`);
      lastCandidate = candidate;
      qaResult = runEditorialValidation(candidate);
      qaResult.warnings.forEach((note) => console.log(`${COLORS.detail}${GLYPHS.info} QA note: ${note}${COLORS.reset}`));
      if (qaResult.errors.length === 0) {
        briefing = candidate;
        break;
      }
      qaResult.errors.forEach((err) => console.log(`${COLORS.warn}${GLYPHS.warn} QA error on attempt ${attempt}: ${err}${COLORS.reset}`));
      if (attempt < MAX_BRIEFING_ATTEMPTS) {
        console.log(`${COLORS.detail}${GLYPHS.info} Retrying briefing generation with stricter constraints...${COLORS.reset}`);
      }
    }

    if (!briefing) {
      if (lastCandidate) {
        console.log(`${COLORS.warn}${GLYPHS.warn} QA errors persist after ${MAX_BRIEFING_ATTEMPTS} attempts; proceeding with latest draft and logging warnings.${COLORS.reset}`);
        qaResult.errors.forEach((err) => qaFlags.push(`QA error: ${err}`));
        briefing = lastCandidate;
      } else {
        const fallbackEdition = await loadFallbackEdition(editionDate);
        if (fallbackEdition) {
          console.log(`${COLORS.warn}${GLYPHS.info} QA failed; using fallback edition ${fallbackEdition.slug}.${COLORS.reset}`);
          await writeFallbackEdition(editionDate, fallbackEdition);
          return;
        }
        throw new Error("QA validation failed and no fallback edition available.");
      }
    }

    qaFlags.push(...qaResult.warnings);

    const frontmatter = {
      date: editionDate,
      title: buildEditionTitle(editionDate),
      timezone: config.timezone,
      sources: sourcesWithContent,
      generatedAt: new Date().toISOString(),
      readingMinutes: briefing.readingMinutes,
      wordCount: briefing.wordCount
    };
    
    spinner = ora(`Writing edition markdown file...`).start();
    const generationTimeSeconds = Math.round((Date.now() - startTime) / 1000);
    const markdown = composeMarkdown(frontmatter, briefing, narrativeStories);
    await writeEditionFile(editionDate, markdown);
    await writeSeenCache(seen);
    spinner.succeed(`Edition file written`);

    // Persist summary metrics JSON artifact
    try {
      const metrics = getSummaryMetrics();
      await fs.mkdir(path.dirname(SUMMARY_METRICS_PATH), { recursive: true });
      await fs.writeFile(SUMMARY_METRICS_PATH, JSON.stringify({ date: editionDate, generatedAt: new Date().toISOString(), model: config.opencode.model, metrics }, null, 2) + '\n', 'utf8');
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[metrics] Failed to write metrics: ${(err as Error).message}`);
      }
    }

    const minutes = Math.floor(generationTimeSeconds / 60);
    const seconds = generationTimeSeconds % 60;
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    
    console.log(
      `\n${COLORS.success}${GLYPHS.success} Edition ${editionDate} ${forceRegeneration ? "regenerated" : "created"} successfully!${COLORS.reset}`
    );
    console.log(`  ${COLORS.detail}${GLYPHS.folder} ${path.relative(process.cwd(), targetEditionPath)}${COLORS.reset}`);
    console.log(`  ${COLORS.detail}${GLYPHS.stats} ${totalItems} articles from ${sourcesWithContent.length} sources${COLORS.reset}`);
    if (qaFlags.length) {
      qaFlags.forEach((note) => console.log(`${COLORS.warn}${GLYPHS.info} QA flag: ${note}${COLORS.reset}`));
    }
    // Summary metrics breakdown
    const metrics = getSummaryMetrics();
    const metricKeys = Object.keys(metrics);
    if (metricKeys.length) {
      const ordered = ['success','success_after_retry','parse_fail','request_error','refusal_fallback','exhausted_fallback'];
      const lines = ordered.filter(k => metrics[k]).map(k => `${k}=${metrics[k]}`);
      const others = metricKeys.filter(k => !ordered.includes(k)).sort();
      for (const k of others) { lines.push(`${k}=${metrics[k]}`); }
      console.log(`  ${COLORS.detail}${GLYPHS.info} summary-metrics ${lines.join(' ')}${COLORS.reset}`);
    }
    console.log(`  ${COLORS.detail}${GLYPHS.timer} Generated in ${timeStr}${COLORS.reset}\n`);
    
    process.exit(0);
  } catch (error) {
    if (spinner) {
      spinner.fail("Edition build failed");
    }
    console.error(`\n${COLORS.warn}Error:${COLORS.reset}`, error);
    process.exit(1);
  }
}

async function loadConfig(): Promise<DigestConfig> {
  try {
    const configRaw = await fs.readFile(CONFIG_PATH, "utf8");
    const configParsed = YAML.parse(configRaw);
    const config = configSchema.parse(configParsed);

    const feedsRaw = await fs.readFile(FEEDS_CONFIG_PATH, "utf8");
    const feedsParsed = YAML.parse(feedsRaw);
    const feedsData = feedsSchema.parse(feedsParsed);

    if (process.env.OPENCODE_MODEL && typeof process.env.OPENCODE_MODEL === 'string' && process.env.OPENCODE_MODEL.trim()) {
      (config as any).opencode.model = process.env.OPENCODE_MODEL.trim();
    }
    return {
      ...config,
      feeds: feedsData.feeds
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      const missingFile = (error as NodeJS.ErrnoException).path?.includes('config.yml') ? 'config.yml' : 'feeds.yml';
      throw new Error(
        `${missingFile} is missing. Copy ${missingFile === 'config.yml' ? 'config.example.yml' : 'feeds.example.yml'} to ${missingFile} and customise your settings before running the script.`
      );
    }
    if (error instanceof z.ZodError) {
      const issues = error.issues
        .map((issue) => {
          const path = Array.isArray(issue.path) && issue.path.length > 0 ? issue.path.join(".") : "<root>";
          return `- ${path}: ${issue.message}`;
        })
        .join("\n");
      throw new Error(`Configuration is invalid:\n${issues}`);
    }
    throw error;
  }
}

function resolveEditionDate(): string {
  const arg = process.argv[2];
  if (!arg) {
    const today = new Date();
    const iso = today.toISOString();
    return iso.slice(0, 10);
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(arg)) {
    throw new Error("Edition date must be in YYYY-MM-DD format.");
  }
  return arg;
}

function addDays(date: string, delta: number): string {
  const [year, month, day] = date.split("-").map((part) => Number(part));
  const base = new Date(Date.UTC(year, month - 1, day));
  base.setUTCDate(base.getUTCDate() + delta);
  return base.toISOString().slice(0, 10);
}

async function loadFallbackEdition(date: string, maxLookback = 3): Promise<EditionDocument | null> {
  let attempts = 0;
  let cursor = date;
  while (attempts < maxLookback) {
    cursor = addDays(cursor, -1);
    const edition = await loadEditionByDate(cursor);
    if (edition) {
      return edition;
    }
    attempts++;
  }
  return null;
}

async function loadSeenCache(): Promise<SeenCache> {
  try {
    const raw = await fs.readFile(SEEN_CACHE_PATH, "utf8");
    const list = JSON.parse(raw) as string[];
    if (!Array.isArray(list)) {
      throw new Error("seen.json must be an array of hashes.");
    }
    return new Set(list);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return new Set();
    }
    throw error;
  }
}

async function writeSeenCache(seen: SeenCache): Promise<void> {
  const serialised = JSON.stringify(Array.from(seen), null, 2);
  await fs.writeFile(SEEN_CACHE_PATH, `${serialised}\n`, "utf8");
}

async function fetchFeedItems(feedUrl: string) {
  const feed = await rssParser.parseURL(feedUrl);
  return (feed.items ?? []).map((item) => ({
    title: item.title ?? "Untitled",
    url: item.link ?? item.guid ?? "",
    publishedAt: item.isoDate ?? item.pubDate ?? new Date().toISOString(),
    rawContent: item["content:encoded"] ?? item.content ?? item.contentSnippet ?? ""
  }));
}

function parsePublishedAt(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
}

function pickFreshItems(
  items: Array<{ title: string; url: string; publishedAt: string; rawContent: string }>,
  seen: SeenCache,
  window: CollectionWindow,
  max: number,
  options: { ignoreSeen?: boolean } = {}
) {
  const fresh: typeof items = [];
  const ignoreSeen = options.ignoreSeen ?? false;
  const sorted = [...items].sort((a, b) => {
    const aDate = parsePublishedAt(a.publishedAt);
    const bDate = parsePublishedAt(b.publishedAt);
    return (bDate?.getTime() ?? 0) - (aDate?.getTime() ?? 0);
  });
  for (const item of sorted) {
    if (!item.url) {
      continue;
    }
    const publishedAt = parsePublishedAt(item.publishedAt);
    if (publishedAt) {
      if (publishedAt >= window.end) {
        continue;
      }
      if (publishedAt < window.start) {
        break;
      }
    }
    const hash = fingerprintUrl(item.url);
    if (!ignoreSeen && seen.has(hash)) {
      continue;
    }
    fresh.push(item);
    if (fresh.length >= max) {
      break;
    }
  }
  return fresh;
}

async function hydrateArticleTexts(stories: PendingStory[], config: DigestConfig, spinner?: Ora): Promise<void> {
  if (stories.length === 0) return;
  let completed = 0;
  const perDomainActive = new Map<string, number>();
  let globalActive = 0;
  const queue = [...stories];

  function nextEligibleIndex(): number {
    if (globalActive >= HYDRATE_CONCURRENCY) return -1;
    for (let i = 0; i < queue.length; i++) {
      const story = queue[i];
      let host = "unknown";
      try { host = new URL(story.item.url).hostname; } catch { /* ignore */ }
      const activeForHost = perDomainActive.get(host) || 0;
      if (activeForHost < HYDRATE_PER_DOMAIN_CONCURRENCY) {
        return i;
      }
    }
    return -1;
  }

  await new Promise<void>((resolve) => {
    const maybeDispatch = () => {
      while (true) {
        const idx = nextEligibleIndex();
        if (idx === -1) break;
        const story = queue.splice(idx, 1)[0];
        let host = "unknown";
        try { host = new URL(story.item.url).hostname; } catch { /* ignore */ }
        perDomainActive.set(host, (perDomainActive.get(host) || 0) + 1);
        globalActive++;
        if (spinner) {
          spinner.text = `Fetching full article content (${completed + 1}/${stories.length}) - ${story.item.title.slice(0, 50)}...`;
        }
        resolveItemText(story.item, config)
          .then(text => { story.text = text; })
          .catch(() => { story.text = story.text || ""; })
          .finally(() => {
            completed++;
            perDomainActive.set(host, (perDomainActive.get(host) || 1) - 1);
            globalActive--;
            if (completed >= stories.length) {
              resolve();
              return;
            }
            maybeDispatch();
          });
      }
    };
    maybeDispatch();
  });
}


async function summariseStories(
  stories: PendingStory[],
  config: DigestConfig,
  seen: SeenCache,
  narrativeStories: EditionNarrativeItem[],
  spinner?: Ora
): Promise<void> {
  let completed = 0;
  const orderMap = new Map(stories.map((s, i) => [s.item.url, i] as const));
  // We purposely mutate buckets in-place to retain grouping by feed.
  await runPool(stories, SUMMARY_CONCURRENCY, async (story) => {
    const text = story.text ?? "";
    const summaryInput = toSummariseInput(story.item, config, text);
    const summary = await summariseWithOC(summaryInput, config);

    // Use translated title with language marker if available
    const originalTitle = story.item.title;
    let displayTitle = originalTitle;
    if ((summary as any).translatedTitle) {
      const originalLang = detectLanguage(originalTitle);
      const langCode = originalLang === "English" ? "en" : originalLang === "French" ? "fr" : originalLang.toLowerCase().slice(0, 2);
      displayTitle = `${(summary as any).translatedTitle} [${langCode}]`;
    }

    const editionItem: EditionItem = {
      title: displayTitle,
      url: story.item.url,
      publishedAt: story.item.publishedAt,
      summary
    };
    story.bucket.push(editionItem);
    narrativeStories.push({
      feed: story.feedTitle,
      title: displayTitle,
      url: story.item.url,
      publishedAt: story.item.publishedAt,
      summary
    });
    const fingerprint = fingerprintUrl(story.item.url);
    seen.add(fingerprint);
    completed++;
    if (spinner) {
      spinner.text = `Generating AI summaries (${completed}/${stories.length}) - ${story.item.title.slice(0, 50)}...`;
    }
  });
  // Deterministic ordering: reflect original pendingStories order regardless of completion timing.
  narrativeStories.sort((a, b) => (orderMap.get(a.url)! - orderMap.get(b.url)!));
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>): Promise<void> {
  const size = items.length;
  if (size === 0) return;
  let cursor = 0;
  const runners: Promise<void>[] = [];
  const limit = Math.max(1, concurrency);
  for (let i = 0; i < Math.min(limit, size); i++) {
    runners.push((async function pump() {
      while (true) {
        const current = cursor++;
        if (current >= size) break;
        await worker(items[current], current);
      }
    })());
  }
  await Promise.all(runners);
}

function resolveCollectionWindow(
  date: string,
  digest: DigestConfig["digest"],
  timezone: string
): CollectionWindow {
  const end = buildZonedDate(date, timezone, digest.hour, digest.minute);
  const start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
  return { start, end };
}

function buildZonedDate(date: string, timezone: string, hour: number, minute: number): Date {
  const [year, month, day] = date.split("-").map(Number);
  const utcBaseline = new Date(Date.UTC(year, (month ?? 1) - 1, day ?? 1, hour, minute, 0, 0));
  const offsetMinutes = getTimeZoneOffset(utcBaseline, timezone);
  return new Date(utcBaseline.getTime() - offsetMinutes * 60 * 1000);
}

function getTimeZoneOffset(date: Date, timezone: string): number {
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
    const parts = dtf.formatToParts(date);
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const asUTC = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour),
      Number(map.minute),
      Number(map.second)
    );
    return (asUTC - date.getTime()) / 60000;
  } catch {
    return 0;
  }
}

function formatInTimezone(date: Date, timezone: string): string {
  try {
    const formatter = new Intl.DateTimeFormat("fr-FR", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
    return formatter.format(date);
  } catch {
    return date.toISOString();
  }
}

async function resolveItemText(
  item: { title: string; url: string; rawContent: string },
  config: DigestConfig
): Promise<string> {
  const cleaned = normaliseContent(item.rawContent);
  if (cleaned.length >= config.digest.min_chars_per_summary) {
    return cleaned;
  }
  if (!item.url) {
    return cleaned;
  }
  const article = await fetchArticleContent(item.url, 10_000);
  if (article) {
    return article;
  }
  return cleaned;
}

function toSummariseInput(
  item: { title: string; url: string },
  config: DigestConfig,
  text: string
): SummariseInput {
  return {
    title: item.title,
    url: item.url,
    text,
    maxChars: config.digest.max_chars_per_summary,
    minChars: config.digest.min_chars_per_summary
  };
}

function normaliseContent(html: string): string {
  if (!html) {
    return "";
  }
  return htmlToText(html, {
    wordwrap: false,
    selectors: [
      { selector: "a", options: { ignoreHref: true } },
      { selector: "img", format: "skip" }
    ]
  })
    .replace(/\s+/g, " ")
    .trim();
}

async function fetchArticleContent(url: string, timeoutMs: number): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "rss-digest/0.1 (+https://github.com/)"
      }
    });
    if (!response.ok) {
      return null;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("text/html")) {
      return null;
    }
    const html = await response.text();
    const text = normaliseContent(html);
    return text.length > 0 ? text : null;
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function fingerprintUrl(url: string): string {
  return crypto.createHash("sha1").update(url).digest("hex");
}

function buildEditionTitle(date: string): string {
  const [year, month, day] = date.split("-");
  return `Daily Brief — ${day} ${monthName(Number(month))} ${year}`;
}

function monthName(month: number): string {
  return new Date(2000, month - 1, 1).toLocaleString("en-GB", { month: "short" });
}

function composeMarkdown(
  frontmatter: {
    date: string;
    title: string;
    timezone: string;
    sources: EditionSource[];
    generatedAt: string;
    readingMinutes?: number;
    wordCount?: number;
    targetReadingMinutes?: number;
  },
  briefing: EditionBriefing,
  stories: EditionNarrativeItem[]
): string {
  const yaml = YAML.stringify(frontmatter, {
    defaultStringType: "QUOTE_DOUBLE"
  }).trim();
  const summaryMarkdown = briefing.summaryOfDay.trim();
  const analysisMarkdown = briefing.criticalAnalysis.trim();
  const pointsMarkdown = renderList(briefing.pointsToRemember);
  const watchlistMarkdown = renderWatchlist(briefing.toWatch, frontmatter.timezone);
  const curiositiesMarkdown = renderList(briefing.curiosities);
  const positivesMarkdown = renderList(briefing.positiveNotes);

  const sections = [
    "# Synthèse du jour",
    summaryMarkdown,
    "## Analyse critique",
    analysisMarkdown,
    pointsMarkdown ? "## Points à retenir" : "",
    pointsMarkdown,
    watchlistMarkdown ? "## À surveiller" : "",
    watchlistMarkdown,
    curiositiesMarkdown ? "## Curiosités" : "",
    curiositiesMarkdown,
    positivesMarkdown ? "## Points positifs" : "",
    positivesMarkdown
  ].filter((block) => block.length > 0);

  return `---\n${yaml}\n---\n\n${sections.join("\n\n")}\n`;
}

function formatWatchDate(input: string, timezone: string): string {
  const trimmed = (input || "").trim();
  if (!trimmed) {
    return "";
  }
  const isoLike = /^\d{4}-\d{2}-\d{2}(?:[T\s].*)?$/;
  if (!isoLike.test(trimmed)) {
    return trimmed;
  }
  const date = trimmed.length === 10 ? `${trimmed}T00:00:00Z` : trimmed;
  try {
    const parsed = new Date(date);
    if (Number.isNaN(parsed.getTime())) {
      return trimmed;
    }
    return new Intl.DateTimeFormat("fr-FR", {
      day: "2-digit",
      month: "short",
      timeZone: timezone
    }).format(parsed);
  } catch {
    return trimmed;
  }
}

function renderWatchlist(entries: EditionBriefing["toWatch"], timezone: string): string {
  if (!entries.length) {
    return "Aucun jalon imminent n'a été identifié aujourd'hui.";
  }
  return entries
    .map((entry) => {
      const dateLabel = entry.date ? formatWatchDate(entry.date, timezone) : "";
      const heading = dateLabel ? `${dateLabel} — ${entry.title}` : entry.title;
      const rawDetail = (entry.detail || "").trim();
      const detail = rawDetail
        ? rawDetail.includes("[↗")
          ? rawDetail
          : `${rawDetail} [↗ ${entry.source}](${entry.url})`
        : `[↗ ${entry.source}](${entry.url})`;
      const indicatorLine = entry.indicator ? `\n  Indicateur : ${entry.indicator}` : "";
      return `- **${heading}**${indicatorLine}\n  ${detail}`;
    })
    .join("\n");
}

function renderList(items: string[]): string {
  if (!items.length) {
    return "";
  }
  return items.map((item) => `- ${item.trim()}`).join("\n");
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function extractSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function normaliseUrl(url: string): string {
  return url.trim().toLowerCase();
}

function collectSourceUrls(text: string): string[] {
  const urls: string[] = [];
  const regex = /\[↗[^\]]*\]\(([^)]+)\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    urls.push(normaliseUrl(match[1]));
  }
  return urls;
}

function collectSourceUrlsFromList(items: string[]): string[] {
  return collectSourceUrls(items.join(" "));
}

function computeJaccardCoefficient(a: string, b: string): number {
  const tokenise = (text: string): Set<string> => {
    const tokens = text.toLowerCase().match(/\p{L}{3,}/gu) ?? [];
    return new Set(tokens);
  };
  const setA = tokenise(a);
  const setB = tokenise(b);
  if (setA.size === 0 && setB.size === 0) {
    return 0;
  }
  const intersectionSize = [...setA].filter((token) => setB.has(token)).length;
  const unionSize = new Set([...setA, ...setB]).size;
  if (unionSize === 0) {
    return 0;
  }
  return intersectionSize / unionSize;
}

function detectDuplicateSentences(text: string): string[] {
  const sentences = extractSentences(text);
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();
  for (const sentence of sentences) {
    const normalised = sentence.replace(/[^\p{L}\p{N}'-]+/gu, " ").trim().toLowerCase();
    if (normalised.length < 16) {
      continue;
    }
    if (seen.has(normalised)) {
      duplicates.add(sentence);
    } else {
      seen.set(normalised, sentence);
    }
  }
  return [...duplicates];
}

function runEditorialValidation(briefing: EditionBriefing): { warnings: string[]; errors: string[] } {
  const warnings: string[] = [];
  const errors: string[] = [];

  const summaryParagraphs = splitParagraphs(briefing.summaryOfDay);
  const analysisParagraphs = splitParagraphs(briefing.criticalAnalysis);

  const summaryWords = countWords(briefing.summaryOfDay);
  const analysisWords = countWords(briefing.criticalAnalysis);
  const pointsWords = countWords(briefing.pointsToRemember.join(" "));
  const watchWords = countWords(briefing.toWatch.map((entry) => `${entry.title} ${entry.detail} ${entry.indicator ?? ""}`).join(" "));
  const curiosityWords = countWords(briefing.curiosities.join(" "));
  const positivesWords = countWords(briefing.positiveNotes.join(" "));
  const computedTotal = summaryWords + analysisWords + pointsWords + watchWords + curiosityWords + positivesWords;

  if (summaryWords < 1000 || summaryWords > 1400) {
    errors.push(`Synthèse du jour length is ${summaryWords} words; enforce the 1 000–1 400 range.`);
  }
  if (analysisWords < 900 || analysisWords > 1200) {
    errors.push(`Analyse critique length is ${analysisWords} words; enforce the 900–1 200 range.`);
  }

  const totalWordEstimate = briefing.wordCount ?? computedTotal;
  if (totalWordEstimate < 2800) {
    errors.push(`Word count too low (${totalWordEstimate}); expected at least 2 800.`);
  }
  if (totalWordEstimate > 3600) {
    warnings.push(`Word count is ${totalWordEstimate}; tighten the copy to remain below 3 600 words.`);
  }

  if (summaryParagraphs.length < 4 || summaryParagraphs.length > 6) {
    errors.push("Synthèse du jour must deliver four to five thematic paragraphs with distinct angles.");
  }

  const missingCitations = [...summaryParagraphs, ...analysisParagraphs].filter(
    (paragraph) => paragraph.length > 0 && !paragraph.includes("[↗")
  );
  if (missingCitations.length > 0) {
    errors.push("Every long-form paragraph must include an inline [↗ Source](URL) citation.");
  }

  for (const paragraph of summaryParagraphs) {
    const sourcesInParagraph = new Set(collectSourceUrls(paragraph));
    if (sourcesInParagraph.size < 2) {
      errors.push("Each thematic block in 'Synthèse du jour' must include at least two distinct sources.");
      break;
    }
  }

  if (analysisParagraphs.length < 4 || analysisParagraphs.length > 6) {
    errors.push("Analyse critique must contain between four and six paragraphs.");
  }
  const causalVerbPattern = /\b(expose|exposent|révèle|révèlent|fragilise|fragilisent|renforce|renforcent|transforme|transforment)\b/i;
  for (const paragraph of analysisParagraphs) {
    if (!causalVerbPattern.test(paragraph)) {
      errors.push("Each paragraph in 'Analyse critique' must include at least one causal verb (expose, révèle, fragilise, renforce, transforme).");
      break;
    }
  }
  if (/les développements autour de/i.test(briefing.criticalAnalysis)) {
    errors.push("Remove the phrase “Les développements autour de” from 'Analyse critique'.");
  }

  const duplicateIssues: string[] = [];
  const sectionsForDuplicates: Array<{ name: string; content: string }> = [
    { name: "Synthèse du jour", content: briefing.summaryOfDay },
    { name: "Analyse critique", content: briefing.criticalAnalysis },
    { name: "Points à retenir", content: briefing.pointsToRemember.join(" ") },
    {
      name: "À surveiller",
      content: briefing.toWatch.map((entry) => `${entry.title}. ${entry.detail}`).join(" ")
    },
    { name: "Curiosités", content: briefing.curiosities.join(" ") },
    { name: "Points positifs", content: briefing.positiveNotes.join(" ") }
  ];
  for (const section of sectionsForDuplicates) {
    const duplicates = detectDuplicateSentences(section.content);
    if (duplicates.length > 0) {
      duplicateIssues.push(section.name);
    }
  }
  if (duplicateIssues.length > 0) {
    errors.push(`Duplicate or near-duplicate sentences detected within: ${duplicateIssues.join(", ")}.`);
  }

  const sentences = extractSentences(`${briefing.summaryOfDay}\n${briefing.criticalAnalysis}`);
  if (sentences.length > 0) {
    const leadingArticles = sentences.filter((sentence) => /^l['’]|^le\s+/i.test(sentence)).length;
    if (leadingArticles / sentences.length > 0.25) {
      warnings.push("More than 25% of sentences begin with 'L'' or 'Le'; vary sentence openings.");
    }
  }

  if (briefing.pointsToRemember.length < 5 || briefing.pointsToRemember.length > 7) {
    errors.push("Points à retenir must list 5 to 7 bullets.");
  }
  const parset = new Set<string>();
  for (const point of briefing.pointsToRemember) {
    if (!/[—:]/.test(point)) {
      warnings.push("Each point à retenir should follow the actor — action — impact pattern.");
      break;
    }
    if (!point.includes("[↗")) {
      errors.push("Each 'Points à retenir' entry must include an inline source citation.");
      break;
    }
    const normalisedLength = point.replace(/\s+/g, " ").trim().length;
    if (normalisedLength > 200) {
      errors.push("Points à retenir bullets must stay within 200 characters.");
      break;
    }
    const normalised = point.trim().toLowerCase();
    if (parset.has(normalised)) {
      warnings.push("Duplicate entry detected in Points à retenir.");
      break;
    }
    parset.add(normalised);
  }

  if (briefing.toWatch.length < 4 || briefing.toWatch.length > 6) {
    errors.push("À surveiller must list between 4 and 6 milestones.");
  }
  for (const entry of briefing.toWatch) {
    if (!entry.date || entry.date.trim().length === 0) {
      errors.push("Each 'À surveiller' entry must include a date or horizon.");
      break;
    }
    if (!entry.indicator || entry.indicator.trim().length === 0) {
      errors.push("Each 'À surveiller' entry must include an indicator.");
      break;
    }
    if (!entry.detail.includes("[↗")) {
      errors.push("Each 'À surveiller' detail must include an inline source citation.");
      break;
    }
  }

  if (briefing.curiosities.length === 0) {
    warnings.push("Curiosités section is empty; provide at least one open question.");
  }
  if (briefing.curiosities.length > 3) {
    warnings.push("Curiosités should contain at most three items.");
  }
  for (const curiosity of briefing.curiosities) {
    if (!curiosity.trim().endsWith("?")) {
      warnings.push("Each Curiosité must be phrased as an interrogative sentence.");
      break;
    }
    if (!curiosity.includes("[↗")) {
      errors.push("Each Curiosité must cite at least one source.");
      break;
    }
    if (curiosity.length > 280) {
      warnings.push("Curiosités should remain concise (no more than three lines).");
      break;
    }
  }

  if (briefing.positiveNotes.length < 2 || briefing.positiveNotes.length > 3) {
    errors.push("Points positifs should contain two or three short paragraphs.");
  }
  for (const note of briefing.positiveNotes) {
    if (!note.includes("[↗")) {
      errors.push("Each paragraph in Points positifs must cite at least one source.");
      break;
    }
    const words = countWords(note);
    if (words < 110 || words > 190) {
      errors.push("Each 'Points positifs' paragraph should run between roughly 110 and 190 words.");
      break;
    }
  }

  const sectionSources: Array<{ name: string; urls: string[] }> = [
    { name: "Synthèse du jour", urls: collectSourceUrls(briefing.summaryOfDay) },
    { name: "Analyse critique", urls: collectSourceUrls(briefing.criticalAnalysis) },
    { name: "Points à retenir", urls: collectSourceUrlsFromList(briefing.pointsToRemember) },
    {
      name: "À surveiller",
      urls: collectSourceUrls(briefing.toWatch.map((entry) => `${entry.detail} ${entry.indicator ?? ""}`).join(" "))
    },
    { name: "Curiosités", urls: collectSourceUrlsFromList(briefing.curiosities) },
    { name: "Points positifs", urls: collectSourceUrls(briefing.positiveNotes.join(" ")) }
  ];
  const allSources = new Set<string>();
  for (const section of sectionSources) {
    const urls = section.urls;
    const uniqueUrls = new Set(urls);
    if (uniqueUrls.size < 2) {
      errors.push(`${section.name} must reference at least two distinct sources.`);
    }
    if (uniqueUrls.size > 5) {
      errors.push(`${section.name} should cap distinct sources at five to avoid clutter.`);
    }
    if (uniqueUrls.size !== urls.length) {
      errors.push(`${section.name} contains duplicate source URLs; collapse repeated links.`);
    }
    for (const url of uniqueUrls) {
      allSources.add(url);
    }
  }
  if (allSources.size < 6) {
    errors.push(`Too few distinct sources overall (${allSources.size}); provide at least six.`);
  }
  if (allSources.size > 12) {
    warnings.push(`High number of distinct sources overall (${allSources.size}); consider consolidating to stay within twelve.`);
  }

  const jaccardSimilarity = computeJaccardCoefficient(briefing.summaryOfDay, briefing.criticalAnalysis);
  if (jaccardSimilarity >= 0.4) {
    errors.push(`Lexical overlap between 'Synthèse du jour' and 'Analyse critique' is too high (Jaccard ${jaccardSimilarity.toFixed(2)} ≥ 0.40). Diversify the vocabulary.`);
  }

  const ecologyKeywords = /\b(écolog|climat|biodiversité|justice sociale|gouvernance|transition écologique|climatique)\b/i;
  const thematicParagraphs = [...summaryParagraphs, ...analysisParagraphs];
  if (!thematicParagraphs.some((paragraph) => ecologyKeywords.test(paragraph))) {
    errors.push("Include at least one paragraph that explicitly addresses ecology, social justice, or governance tension.");
  }

  const summaryAnalysisSentences = extractSentences(`${briefing.summaryOfDay}\n${briefing.criticalAnalysis}`);
  if (summaryAnalysisSentences.length > 0 && briefing.pointsToRemember.length > 0) {
    const bulletFragments = briefing.pointsToRemember
      .map((point) => point.split("[↗")[0].trim().toLowerCase())
      .filter((fragment) => fragment.length >= 25);
    let reusedSentences = 0;
    for (const sentence of summaryAnalysisSentences) {
      const lowerSentence = sentence.toLowerCase();
      if (bulletFragments.some((fragment) => lowerSentence.includes(fragment))) {
        reusedSentences++;
      }
    }
    if (reusedSentences / summaryAnalysisSentences.length > 0.3) {
      errors.push("More than 30% of sentences in long sections recycle phrasing from 'Points à retenir'. Differentiate the prose.");
    }
  }

  return { warnings, errors };
}

function formatGenerationTimestamp(date: Date, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      timeZone: timezone,
      dateStyle: "long",
      timeStyle: "short"
    }).format(date);
  } catch {
    return date.toISOString();
  }
}

function formatGenerationTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes > 0) {
    return `${minutes} min ${secs} s`;
  }
  return `${secs} s`;
}

async function writeEditionFile(date: string, markdown: string): Promise<void> {
  const targetPath = path.join(EDITIONS_DIR, `${date}.md`);
  await fs.writeFile(targetPath, markdown, "utf8");
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function writeFallbackEdition(targetDate: string, edition: EditionDocument): Promise<void> {
  const fallbackFrontmatter = {
    ...edition,
    date: targetDate,
    generatedAt: new Date().toISOString(),
    wordCount: edition.wordCount,
    readingMinutes: edition.readingMinutes
  } as EditionDocument;
  const { content, slug, ...frontmatter } = fallbackFrontmatter;
  const yaml = YAML.stringify(frontmatter, { defaultStringType: "QUOTE_DOUBLE" }).trim();
  const markdown = `---\n${yaml}\n---\n\n${content}\n`;
  await fs.writeFile(path.join(EDITIONS_DIR, `${targetDate}.md`), markdown, "utf8");
}

void main();
