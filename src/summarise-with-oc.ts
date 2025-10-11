import { buildOpenCodePrompt } from "./opencode-prompt";
import { buildEditionNarrativePrompt } from "./opencode-narrative-prompt";
import { buildBriefingPrompt } from "./opencode-briefing-prompt";
import { requestCompletion, warmupClient } from "./oc-client";
import type {
  DigestConfig,
  EditionNarrativeItem,
  EditionBriefing,
  SummariseInput,
  SummariseResult
} from "@/lib/types";

// Reading speed (words per minute) override via env READING_WPM
const READING_WPM = (() => {
  const v = Number(process.env.READING_WPM);
  if (Number.isFinite(v) && v >= 80 && v <= 500) return v;
  return 210; // default average silent reading speed (FR/EN)
})();

export async function warmupOpenCodeClient(config: DigestConfig): Promise<void> {
  await warmupClient(config);
}

export async function summariseWithOC(
  input: SummariseInput,
  config: DigestConfig
): Promise<SummariseResult> {
  const maxAttempts = Number.isFinite(Number(process.env.SUMMARY_RETRIES)) ? Math.min(Math.max(1, Number(process.env.SUMMARY_RETRIES)), 5) : 3;
  const baseDelay = 500;
  let attempt = 0;
  while (attempt < maxAttempts) {
    attempt++;
    const prompt = buildOpenCodePrompt(input, config.language);
    const timeoutMs = config.opencode.timeout_ms;
    try {
      const text: string = await withTimeout(requestCompletion(prompt, config) as Promise<string>, timeoutMs);
      if (text) {
        try {
          const parsed = parseOpenCodeOutput(text);
          return { ...parsed, via: "opencode", engine: config.opencode.model };
        } catch (parseError) {
          if (process.env.NODE_ENV !== "production") {
            const raw = text.trim();
            const lines = raw.split(/\n+/).map(l => l.trim()).filter(Boolean);
            const bulletLines = lines.filter(l => /^[-*•]\s+/.test(l));
            const domain = (() => { try { return new URL(input.url).hostname; } catch { return "unknown"; } })();
            const preview = raw.replace(/\s+/g, ' ').slice(0, 280);
            console.warn(`[summarise] Parse failure attempt ${attempt}/${maxAttempts} title="${input.title}" domain=${domain}: ${(parseError as Error).message}. bullets=${bulletLines.length} preview="${preview}${raw.length > 280 ? '…' : ''}"`);
          }
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV !== "production") {
        const domain = (() => { try { return new URL(input.url).hostname; } catch { return "unknown"; } })();
        console.warn(`[summarise] Request error attempt ${attempt}/${maxAttempts} title="${input.title}" domain=${domain}: ${(error as Error).message}`);
      }
    }
    if (attempt < maxAttempts) {
      const base = baseDelay * Math.pow(2, attempt - 1);
      const jitter = base * (0.1 + Math.random() * 0.2); // 10%-30% extra
      const delay = Math.round(base + jitter);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  return fallbackSummarise(input);
}

function minutesForWords(words: number, target: number): number {
  return Math.max(target, Math.ceil(words / READING_WPM));
}

function parseOpenCodeOutput(raw: string): Omit<SummariseResult, "via" | "engine"> {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("Empty OpenCode response");
  }

  const abstractIndex = lines.findIndex((line) =>
    /^(\*\*|\*)?\s*(ABSTRACT|RÉSUMÉ|RESUME|SYNTHÈSE)\s*[:\-–—]/i.test(line)
  );
  const abstractLine = abstractIndex >= 0 ? lines.splice(abstractIndex, 1)[0] : lines.shift();
  if (!abstractLine) {
    throw new Error("OpenCode response is missing a summary line");
  }

  let abstract = abstractLine
    .replace(/^(\*\*|\*)?\s*(ABSTRACT|RÉSUMÉ|RESUME|SYNTHÈSE)\s*[:\-–—]\s*/i, "")
    .trim();
  if (!abstract) {
    const fallbackIndex = lines.findIndex((line) => !/^[-*•]\s*/.test(line));
    if (fallbackIndex >= 0) {
      abstract = lines.splice(fallbackIndex, 1)[0];
    }
  }
  if (!abstract) {
    throw new Error("OpenCode response contains an empty summary line");
  }

  const bulletCandidates = lines.filter((line) => /^[-*•]\s*/.test(line));
  const bullets: string[] = bulletCandidates
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter((line) => line.length > 0);

  if (bullets.length < 3) {
    const residual = lines.filter((line) => !/^[-*•]\s*/.test(line));
    for (const extra of residual) {
      const segments = extra.split(/(?<=[\.\!\?])\s+/).map((segment) => segment.trim());
      for (const segment of segments) {
        if (segment.length > 0) {
          bullets.push(segment);
        }
        if (bullets.length >= 3) {
          break;
        }
      }
      if (bullets.length >= 3) {
        break;
      }
    }
  }

  if (bullets.length < 3) {
    throw new Error("OpenCode response did not yield three bullet points");
  }

  return { abstract, bullets: bullets.slice(0, 3) };
}

export async function generateEditionNarrative(
  items: EditionNarrativeItem[],
  config: DigestConfig
): Promise<string> {
  if (items.length === 0) {
    return "No new stories were gathered today, but the briefing engine is ready for the next scheduled run.";
  }

  const prompt = buildEditionNarrativePrompt(items, config.language);
  const timeoutMs = config.opencode.timeout_ms;

  try {
    const text = await withTimeout(requestCompletion(prompt, config), timeoutMs);
    if (text) {
      return text.trim();
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[narrative] OpenCode failed, falling back:", (error as Error).message);
    }
  }

  return fallbackNarrative(items);
}

export async function generateBriefingDocument(
  items: EditionNarrativeItem[],
  config: DigestConfig
): Promise<EditionBriefing> {
  if (items.length === 0) {
    return fallbackBriefing(items, config, "Aucune actualité n'a pu être agrégée pour cette édition.");
  }

  const prompt = buildBriefingPrompt(items, config.timezone, config.digest.target_reading_minutes, config.language);
  const timeoutMs = config.opencode.timeout_ms;

  try {
    const text = await withTimeout(requestCompletion(prompt, config), timeoutMs);
    if (text) {
        const parsed = parseBriefingJson(text, config);
      if (parsed) {
        return parsed;
      }
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[briefing] OpenCode failed, falling back:", (error as Error).message);
    }
  }

  const narrative = await generateEditionNarrative(items, config);
  return fallbackBriefing(items, config, narrative);
}

function fallbackSummarise(input: SummariseInput): SummariseResult {
  const abstract = enforceCharLimit(
    `Résumé automatique indisponible. Consultez l’article original pour davantage de détails : ${input.title}.`,
    Math.min(input.maxChars, 380)
  );
  const bullets = [
    "La traduction française n’a pas pu être générée automatiquement.",
    "Un suivi éditorial est nécessaire pour confirmer les points clés.",
    `Source : ${input.url || "lien non communiqué"}`
  ];

  return {
    abstract,
    bullets,
    via: "fallback",
    engine: "local-extractive"
  };
}

function fallbackNarrative(items: EditionNarrativeItem[]): string {
  const limited = items.slice(0, 16);
  if (limited.length === 0) {
    return "Aucun nouvel article n’a été collecté aujourd’hui, mais le moteur de synthèse reste prêt pour la prochaine session.";
  }

  return limited
    .map((story) => {
      const abstract = enforceCharLimit(story.summary.abstract, 280);
      return `Dans ${story.feed}, « ${story.title} » retient l’attention : ${abstract} [Consulter l’article](${story.url})`;
    })
    .join(" ");
}

function parseBriefingJson(raw: string, config: DigestConfig): EditionBriefing | null {
  try {
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      return null;
    }
    const candidate = JSON.parse(raw.slice(jsonStart, jsonEnd + 1));
    if (!candidate || typeof candidate !== "object") {
      return null;
    }
    const timeline = Array.isArray(candidate.timeline)
      ? candidate.timeline
          .map((item: any) => ({
            title: String(item.title ?? ""),
            summary: String(item.summary ?? ""),
            date: String(item.date ?? ""),
            source: String(item.source ?? ""),
            url: String(item.url ?? "")
          }))
          .filter((entry: { title: string; summary: string }) => entry.title && entry.summary)
      : [];

    const fastFacts = Array.isArray(candidate.fastFacts)
      ? candidate.fastFacts.map((fact: any) => String(fact)).filter(Boolean)
      : [];

    const furtherReading = Array.isArray(candidate.furtherReading)
      ? candidate.furtherReading
          .map((item: any) => ({
            title: String(item.title ?? ""),
            url: String(item.url ?? ""),
            note: item.note ? String(item.note) : undefined
          }))
          .filter((item: { title: string; url: string }) => item.title && item.url)
      : [];

    const overview = String(candidate.overview ?? "").trim();
    const background = String(candidate.background ?? "").trim();
    const analysis = String(candidate.analysis ?? "").trim();
    const readingMinutes = Number.isFinite(candidate.readingMinutes)
      ? Math.max(1, Math.round(Number(candidate.readingMinutes)))
      : undefined;
    const wordCount = Number.isFinite(candidate.wordCount) ? Number(candidate.wordCount) : undefined;

    if (!overview) {
      return null;
    }

    const words = overview.split(/\s+/).length + background.split(/\s+/).length + analysis.split(/\s+/).length;

    return {
      overview,
      background,
      analysis,
      timeline,
      fastFacts,
        furtherReading,
        readingMinutes: readingMinutes ?? minutesForWords(words, config.digest.target_reading_minutes),
        wordCount: wordCount ?? words
    };
  } catch {
    return null;
  }
}

function fallbackBriefing(
  items: EditionNarrativeItem[],
  config: DigestConfig,
  narrative: string
): EditionBriefing {
  const sorted = [...items].sort((a, b) => new Date(a.publishedAt).getTime() - new Date(b.publishedAt).getTime());
  const timeline = sorted.slice(0, 6).map((item) => ({
    title: item.title,
    summary: enforceCharLimit(item.summary.abstract, 420),
    date: new Date(item.publishedAt).toISOString().slice(0, 10),
    source: item.feed,
    url: item.url
  }));

  const facts = dedupeStrings(
    items
      .flatMap((item) => item.summary.bullets)
      .map((bullet) => enforceCharLimit(bullet, 140))
      .filter(Boolean)
  ).slice(0, 6);

  const readings = dedupeByUrl(items)
    .slice(0, 5)
    .map((item) => ({
      title: item.title,
      url: item.url,
      note: enforceCharLimit(item.summary.abstract, 160)
    }));

  const background = generateBackgroundParagraph(items, config.timezone);
  const analysis = generateAnalysisParagraph(items);
  const overview = narrative;

  const coreWordCount = [overview, background, analysis]
    .join(" \n")
    .split(/\s+/)
    .filter(Boolean).length;
  // Include abstracts + bullets in extended reading estimate so large editions show higher minutes.
  const supplementalWords = items
    .flatMap(i => [i.summary.abstract, ...i.summary.bullets])
    .join(" ")
    .split(/\s+/)
    .filter(Boolean).length;
  const effectiveWordCount = coreWordCount + supplementalWords;

  return {
    overview,
    background,
    analysis,
    timeline,
    fastFacts: facts,
    furtherReading: readings,
    readingMinutes: minutesForWords(effectiveWordCount, config.digest.target_reading_minutes),
    wordCount: coreWordCount
  };
}

function dedupeStrings(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const key = value.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(value);
  }
  return result;
}

function dedupeByUrl(items: EditionNarrativeItem[]): EditionNarrativeItem[] {
  const seen = new Set<string>();
  const result: EditionNarrativeItem[] = [];
  for (const item of items) {
    if (seen.has(item.url)) {
      continue;
    }
    seen.add(item.url);
    result.push(item);
  }
  return result;
}

function generateBackgroundParagraph(items: EditionNarrativeItem[], timezone: string): string {
  if (items.length === 0) {
    return "";
  }
  const titles = items.slice(0, 12).map(i => i.title);
  const textCorpus = items
    .slice(0, 24)
    .flatMap(i => [i.summary.abstract, ...i.summary.bullets])
    .join(' ')
    .toLowerCase();
  // Simple keyword extraction: frequency of tokens excluding short/common stopwords
  const stop = new Set(['the','a','an','and','or','of','to','in','on','for','avec','les','des','une','un','le','la','et','de','du','dans','sur','par','que','qui','pour']);
  const freq: Record<string, number> = {};
  for (const token of textCorpus.split(/[^a-z0-9éèêàùîïôç]+/i)) {
    const t = token.trim();
    if (t.length < 4) continue;
    if (stop.has(t)) continue;
    freq[t] = (freq[t] || 0) + 1;
  }
  const topKeywords = Object.entries(freq)
    .sort((a,b) => b[1]-a[1])
    .slice(0, 6)
    .map(([k]) => k)
    .filter(Boolean);
  // Representative distinct titles (avoid near duplicates)
  const distinct: string[] = [];
  const seen = new Set<string>();
  for (const t of titles) {
    const key = t.toLowerCase().replace(/[^a-z0-9éèêàùîïôç ]+/gi, '').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    distinct.push(t);
    if (distinct.length >= 4) break;
  }
  const sampleList = distinct.map(t => `« ${t} »`).join(', ');
  const keywordList = topKeywords.slice(0,4).join(', ');
  return `Panorama de ${items.length} articles. Thèmes saillants: ${keywordList || 'divers'}. Exemples: ${sampleList}${distinct.length < items.length ? ', …' : ''}.`;
}

function generateAnalysisParagraph(items: EditionNarrativeItem[]): string {
  if (items.length === 0) {
    return "Aucune analyse approfondie n’est disponible pour cette édition.";
  }
  const feeds = dedupeStrings(items.map((item) => item.feed));
  const highlights = items
    .slice(0, 3)
    .map((item) => enforceCharLimit(item.summary.abstract, 220))
    .join(" ");
  const leadLink = items[0] ? ` [Lire l’article principal](${items[0].url})` : "";
  return `La lecture croisée de ${feeds.length} sources (${feeds.slice(0, 5).join(", ")}${feeds.length > 5 ? ", …" : ""}) fait ressortir trois signaux majeurs : ${highlights}.${leadLink}`;
}

function enforceCharLimit(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars - 1).trim()}…`;
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    return promise;
  }
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`OpenCode request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}
