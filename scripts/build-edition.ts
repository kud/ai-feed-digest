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
import { generateBriefingDocument, generateEditionNarrative, summariseWithOC, warmupOpenCodeClient } from "../src/summarise-with-oc";
import {
  DigestConfig,
  EditionBriefing,
  EditionItem,
  EditionNarrativeItem,
  EditionSource,
  SummariseInput
} from "../src/lib/types";
import { EDITIONS_DIR, CONFIG_PATH, FEEDS_CONFIG_PATH, SEEN_CACHE_PATH } from "../src/lib/constants";

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
// Concurrency for RSS feed fetching (env FEED_CONCURRENCY=10 etc.)
const FEED_CONCURRENCY = (() => {
  const v = Number(process.env.FEED_CONCURRENCY);
  if (Number.isFinite(v) && v >= 1) return Math.min(v, 16);
  return 6; // default
})();

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
    min_chars_per_summary: z.number().int().min(80).max(600),
    target_reading_minutes: z.number().int().min(5).max(120)
  }),
  opencode: z.object({
    model: z.string(),
    agent: z.string().nullable(),
    timeout_ms: z.number().int().min(1).max(120_000)
  })
});

const feedsSchema = z.object({
  feeds: z
    .array(
      z.object({
        title: z.string(),
        url: z.string().url()
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

    if (pendingStories.length === 0) {
      console.log(`${COLORS.warn}${GLYPHS.warn} No new items found. Edition not created.${COLORS.reset}`);
      return;
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

    const sourcesWithContent = sources.filter((source) => source.items.length > 0);
    if (sourcesWithContent.length === 0) {
      console.log(`${COLORS.warn}${GLYPHS.warn} Article text resolution failed. Edition not created.${COLORS.reset}`);
      return;
    }

    const totalItems = sourcesWithContent.reduce((acc, source) => acc + source.items.length, 0);

    const frontmatter = {
      date: editionDate,
      title: buildEditionTitle(editionDate),
      timezone: config.timezone,
      sources: sourcesWithContent,
      generatedAt: new Date().toISOString()
    };

    spinner = ora(`Generating briefing document (overview, analysis, timeline)...`).start();
    const briefing = await generateBriefingDocument(narrativeStories, config);
    spinner.succeed(`Briefing document generated (~${briefing.readingMinutes} min read, ${briefing.wordCount} words)`);
    
    spinner = ora(`Writing edition markdown file...`).start();
    const generationTimeSeconds = Math.round((Date.now() - startTime) / 1000);
    const markdown = composeMarkdown(frontmatter, briefing, narrativeStories);
    await writeEditionFile(editionDate, markdown);
    await writeSeenCache(seen);
    spinner.succeed(`Edition file written`);

    const minutes = Math.floor(generationTimeSeconds / 60);
    const seconds = generationTimeSeconds % 60;
    const timeStr = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
    
    console.log(
      `\n${COLORS.success}${GLYPHS.success} Edition ${editionDate} ${forceRegeneration ? "regenerated" : "created"} successfully!${COLORS.reset}`
    );
    console.log(`  ${COLORS.detail}${GLYPHS.folder} ${path.relative(process.cwd(), targetEditionPath)}${COLORS.reset}`);
    console.log(`  ${COLORS.detail}${GLYPHS.stats} ${totalItems} articles from ${sourcesWithContent.length} sources${COLORS.reset}`);
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
  let completed = 0;
  await runPool(stories, HYDRATE_CONCURRENCY, async (story) => {
    if (spinner) {
      spinner.text = `Fetching full article content (${completed + 1}/${stories.length}) - ${story.item.title.slice(0, 50)}...`;
    }
    story.text = await resolveItemText(story.item, config);
    completed++;
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
    const editionItem: EditionItem = {
      title: story.item.title,
      url: story.item.url,
      publishedAt: story.item.publishedAt,
      summary
    };
    story.bucket.push(editionItem);
    narrativeStories.push({
      feed: story.feedTitle,
      title: story.item.title,
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
  },
  briefing: EditionBriefing,
  stories: EditionNarrativeItem[]
): string {
  const yaml = YAML.stringify(frontmatter, {
    defaultStringType: "QUOTE_DOUBLE"
  }).trim();
  const timelineMarkdown = renderTimeline(briefing.timeline, frontmatter.timezone);
  const factsMarkdown = renderList(briefing.fastFacts);
  const readingMarkdown = renderFurtherReading(briefing.furtherReading);
  const sections = [
    "# L’essentiel du jour",
    `**Temps de lecture estimé :** ${briefing.readingMinutes} minutes (${briefing.wordCount.toLocaleString()} mots environ)`,
    briefing.overview.trim(),
    "## Contexte",
    briefing.background.trim(),
    "## Analyse",
    briefing.analysis.trim(),
    "## À surveiller",
    timelineMarkdown,
    factsMarkdown ? "## Repères rapides" : "",
    factsMarkdown,
    readingMarkdown ? "## Pour aller plus loin" : "",
    readingMarkdown
  ].filter((block) => block.length > 0);

  return `---\n${yaml}\n---\n\n${sections.join("\n\n")}\n`;
}

function formatHighlightTimestamp(input: string, timezone: string): string {
  try {
    const date = new Date(input);
    if (Number.isNaN(date.getTime())) {
      return input;
    }
    return new Intl.DateTimeFormat("en-GB", {
      day: "2-digit",
      month: "short",
      timeZone: timezone
    }).format(date);
  } catch {
    return input;
  }
}

function renderTimeline(
  entries: EditionBriefing["timeline"],
  timezone: string
): string {
  if (!entries.length) {
    return "Aucun jalon majeur n’a été identifié aujourd’hui.";
  }
  return entries
    .map((entry) => {
      const stamped = formatHighlightTimestamp(entry.date, timezone);
      return `- **${stamped} — ${entry.title}** (${entry.source})\n  ${entry.summary}\n  [Lire l'article](${entry.url})`;
    })
    .join("\n");
}

function renderList(items: string[]): string {
  if (!items.length) {
    return "";
  }
  return items.map((item) => `- ${item}`).join("\n");
}

function renderFurtherReading(
  items: EditionBriefing["furtherReading"]
): string {
  if (!items.length) {
    return "";
  }
  return items
    .map((item) => {
      const note = item.note ? ` — ${item.note}` : "";
      return `- [${item.title}](${item.url})${note}`;
    })
    .join("\n");
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

void main();
