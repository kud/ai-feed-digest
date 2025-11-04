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
  let lastRefusal = false;
  while (attempt < maxAttempts) {
    attempt++;
    // Adaptive prompt tweak: if previous attempt looked like refusal, we still use base builder (already hardened)
    const prompt = buildOpenCodePrompt(input, config.language);
    const timeoutMs = config.opencode.timeout_ms;
    try {
      const text: string = await withTimeout(requestCompletion(prompt, config) as Promise<string>, timeoutMs);
      if (text) {
        const cleaned = normaliseModelOutput(text);
        if (isRefusal(cleaned)) {
          lastRefusal = true;
          if (process.env.NODE_ENV !== "production") {
            console.warn(`[summarise] Refusal-style content attempt ${attempt}/${maxAttempts} title="${input.title}" snippet="${cleaned.slice(0,140)}${cleaned.length>140?'…':''}"`);
          }
        } else {
          try {
            const parsed = parseOpenCodeOutput(cleaned);
            incrementMetric('success');
            if (attempt > 1) incrementMetric('success_after_retry');
            const result: SummariseResult & { translatedTitle?: string } = {
              abstract: parsed.abstract,
              bullets: parsed.bullets,
              via: "opencode",
              engine: config.opencode.model
            };
            if (parsed.translatedTitle) {
              result.translatedTitle = parsed.translatedTitle;
            }
            return result;
          } catch (parseError) {
            incrementMetric('parse_fail');
            if (process.env.NODE_ENV !== "production") {
              const raw = cleaned.trim();
              const lines = raw.split(/\n+/).map(l => l.trim()).filter(Boolean);
              const bulletLines = lines.filter(l => /^[-*•]\s+/.test(l));
              const domain = (() => { try { return new URL(input.url).hostname; } catch { return "unknown"; } })();
              const preview = raw.replace(/\s+/g, ' ').slice(0, 280);
              console.warn(`[summarise] Parse failure attempt ${attempt}/${maxAttempts} title="${input.title}" domain=${domain}: ${(parseError as Error).message}. bullets=${bulletLines.length} preview="${preview}${raw.length > 280 ? '…' : ''}"`);
            }
          }
        }
      }
    } catch (error) {
      incrementMetric('request_error');
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
  incrementMetric(lastRefusal ? 'refusal_fallback' : 'exhausted_fallback');
  return fallbackSummarise(input);
}

function minutesForWords(words: number): number {
  // Compute reading minutes purely from words.
  return Math.max(1, Math.ceil(words / READING_WPM));
}

interface SummaryMetrics { [k: string]: number; }
const summaryMetrics: SummaryMetrics = {};
function incrementMetric(key: string) { summaryMetrics[key] = (summaryMetrics[key] || 0) + 1; }
export function getSummaryMetrics() { return { ...summaryMetrics }; }

function normaliseModelOutput(raw: string): string {
  // Collapse repeated whitespace and normalise bullet markers to '- '
  return raw
    .replace(/\r/g, '')
    .split('\n')
    .map((line: string) => line.replace(/^\s*[•*]\s+/, '- '))
    .join('\n')
    .trim();
}

function isRefusal(text: string): boolean {
  const refusalPatterns = [
    /cannot (access|browse|fetch)/i,
    /as an? (ai|language) model/i,
    /do not have (access|the ability)/i,
    /i (can't|cannot) (open|visit)/i,
    /no (content|article) provided/i,
    /provide (more )?information/i,
    /not (enough|sufficient) (information|context)/i,
    /sorry,? i/i
  ];
  return refusalPatterns.some(rx => rx.test(text));
}

function parseOpenCodeOutput(raw: string): Omit<SummariseResult, "via" | "engine"> & { translatedTitle?: string } {
  const lines = raw
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("Empty OpenCode response");
  }

  // Check for translated title
  let translatedTitle: string | undefined;
  const titleIndex = lines.findIndex((line) =>
    /^(\*\*|\*)?\s*(TITLE|TITRE)\s*[:\-–—]/i.test(line)
  );
  if (titleIndex >= 0) {
    const titleLine = lines.splice(titleIndex, 1)[0];
    translatedTitle = titleLine
      .replace(/^(\*\*|\*)?\s*(TITLE|TITRE)\s*[:\-–—]\s*/i, "")
      .trim();
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

  // Accept standard bullets, asterisk, middle dot, or numbered list patterns
  let bulletCandidates = lines.filter((line) => /^(?:[-*•]|\d+\.)\s+/.test(line));
  const bullets: string[] = bulletCandidates
    .map((line) => line.replace(/^(?:[-*•]|\d+\.)\s+/, "").trim())
    .filter((line) => line.length > 0);

  // Handle compressed single-line variants like "1) ... 2) ... 3) ..." or semicolon-separated list
  if (bullets.length === 0) {
    const joined = lines.join(' ');
    // Pattern: sentence-like segments separated by ';'
    if (/;/.test(joined)) {
      joined.split(/;+/).forEach(seg => {
        const s = seg.trim().replace(/^[0-9]+[\).:-]\s*/, '');
        if (s) bullets.push(s);
      });
    }
  }

  // Fallback: mine residual lines for sentence segments
  if (bullets.length < 3) {
    const residual = lines.filter((line) => !/^(?:[-*•]|\d+\.)\s+/.test(line));
    for (const extra of residual) {
      const segments = extra.split(/(?<=[\.!?])\s+/).map((segment) => segment.trim());
      for (const segment of segments) {
        if (segment.length > 0 && !bullets.includes(segment)) {
          bullets.push(segment);
        }
        if (bullets.length >= 3) break;
      }
      if (bullets.length >= 3) break;
    }
  }

  // Final synthesis: derive from abstract sentences if still insufficient
  if (bullets.length < 3) {
    const abstractSegments = abstract.split(/(?<=[\.!?])\s+/).map(s => s.trim()).filter(Boolean);
    for (const seg of abstractSegments) {
      if (!bullets.includes(seg)) bullets.push(seg);
      if (bullets.length >= 3) break;
    }
  }

  // Guarantee three bullets even if model output is sparse
  if (bullets.length < 3) {
    // Try splitting abstract by commas / dashes for extra clauses
    if (bullets.length < 3) {
      const clauseCandidates = abstract
        .split(/[;,:–—\-]\s+/)
        .map(s => s.trim())
        .filter(s => s.length > 25 && !bullets.includes(s));
      for (const c of clauseCandidates) {
        bullets.push(c);
        if (bullets.length >= 3) break;
      }
    }
    // Pad with generic informative lines if still short
    while (bullets.length < 3) {
      if (bullets.length === 0) {
        bullets.push("Résumé trop concis fourni par le modèle.");
      } else if (bullets.length === 1) {
        bullets.push("Informations supplémentaires non extraites automatiquement.");
      } else {
        bullets.push("Consultez l’article original pour les autres détails.");
      }
    }
  }

  // Preserve bullet content without hard truncation; model prompt now discourages overlong bullets.
  const normalised = bullets.slice(0, 3);

  return { abstract, bullets: normalised, translatedTitle };
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
      return ensureMarkdownLinks(text.trim(), items);
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

  // Normalise target_words keys for backward compatibility (camelCase -> snake_case)
  const tw = config.digest.target_words as any;
  const normalizedTargetWords = {
    synthesis: tw.synthesis,
    analysis: tw.analysis,
    key_points: tw.key_points ?? tw.keyPoints,
    watch_points: tw.watch_points ?? tw.watchPoints,
    curiosities: tw.curiosities,
    positives: tw.positives
  };
  if ((tw.keyPoints || tw.watchPoints) && process.env.NODE_ENV !== "production") {
    console.warn("[config] target_words.keyPoints/watchPoints are deprecated; use key_points/watch_points");
  }
  const prompt = buildBriefingPrompt(items, config.timezone, normalizedTargetWords, config.language);
  const timeoutMs = config.opencode.timeout_ms;

  try {
    const text = await withTimeout(requestCompletion(prompt, config), timeoutMs);
    if (text) {
        const parsed = parseBriefingJson(text, config);
        if (parsed) {
          return {
            ...parsed,
            synthesis: ensureMarkdownLinks(parsed.synthesis, items),
            analysis: ensureMarkdownLinks(parsed.analysis, items),
            key_points: ensureMarkdownLinks(parsed.key_points, items),
            watch_points: ensureMarkdownLinks(parsed.watch_points, items),
            curiosities: ensureMarkdownLinks(parsed.curiosities, items),
            positives: ensureMarkdownLinks(parsed.positives, items)
          };
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

function ensureMarkdownLinks(text: string, items: EditionNarrativeItem[]): string {
  // Build lookup map by normalised title
  const map = new Map<string, EditionNarrativeItem>();
  for (const it of items) {
    const key = normaliseTitle(it.title);
    if (!map.has(key)) map.set(key, it);
  }
  // Pattern captures titles in French quotes followed by optional comma/space then opening parenthesis feed and possibly closing parenthesis.
  // Example: « Title Here », selon Le Monde (« Title Here »), Le Monde ("Title Here") etc.
  return text.replace(/[«“"]([^»”"]{8,120})[»”"][\s]*\(([^)]+)\)/g, (match, rawTitle, feedPart) => {
    const key = normaliseTitle(rawTitle);
    const item = map.get(key);
    if (!item) return match; // leave unchanged
    // If already contains ](http we assume it's already a link
    if (/\[[^\]]+\]\(https?:\/\//.test(match)) return match;
    return `[${rawTitle}](${item.url}) (${item.feed})`;
  });
}

function normaliseTitle(title: string): string {
  return title.toLowerCase().replace(/\s+/g, ' ').replace(/[^a-z0-9éèêàùîïôç'\- ]+/gi, '').trim();
}
function fallbackSummarise(input: SummariseInput): SummariseResult {
  const abstract = enforceCharLimit(
    `Résumé automatique indisponible. Consultez l’article original pour davantage de détails : ${input.title}.`,
    input.maxChars
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

    const synthesis = String(candidate.synthesis ?? "").trim();
    const analysis = String(candidate.analysis ?? "").trim();
    // Accept both snake_case and camelCase from model output
    const key_points = String((candidate.key_points ?? candidate.keyPoints) ?? "").trim();
    const watch_points = String((candidate.watch_points ?? candidate.watchPoints) ?? "").trim();
    const curiosities = String(candidate.curiosities ?? "").trim();
    const positives = String(candidate.positives ?? "").trim();
    const readingMinutes = Number.isFinite(candidate.readingMinutes)
      ? Math.max(1, Math.round(Number(candidate.readingMinutes)))
      : undefined;
    const wordCount = Number.isFinite(candidate.wordCount) ? Number(candidate.wordCount) : undefined;

    if (!synthesis) {
      return null;
    }

    const words = [synthesis, analysis, key_points, watch_points, curiosities, positives]
      .map(section => section.split(/\s+/).length)
      .reduce((sum, count) => sum + count, 0);

    return {
      synthesis,
      analysis,
      key_points,
      watch_points,
      curiosities,
      positives,
      timeline,
      fastFacts,
      furtherReading,
      readingMinutes: readingMinutes ?? minutesForWords(words),
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

  // Generate v4 briefing fields
  const synthesis = narrative;
  const analysis = generateAnalysisParagraph(items);
  
  // Extract key points from narrative (first 3-4 sentences)
  const sentences = narrative.split(/[.!?]+\s+/).filter(Boolean);
  const key_points = sentences.slice(0, Math.min(3, sentences.length)).map(s => s.trim() + '.').join(' ');
  
  // Generate watch points from analysis
  const watch_points = `Key developments to monitor based on recent trends and emerging patterns in the coverage.`;
  
  // Generate curiosities as questions arising from the content
  const curiosities = `What are the longer-term implications of these developments? How might emerging trends evolve?`;
  
  // Generate positives focusing on constructive aspects
  const positives = `Notable progress and constructive developments identified across the coverage period.`;

  const coreWordCount = [synthesis, analysis, key_points, watch_points, curiosities, positives]
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
    synthesis,
    analysis,
    key_points,
    watch_points,
    curiosities,
    positives,
    timeline,
    fastFacts: facts,
    furtherReading: readings,
    readingMinutes: minutesForWords(effectiveWordCount),
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

interface ThemeCandidate { token: string; score: number; items: EditionNarrativeItem[]; }
interface Theme { label: string; sources: string[]; titles: string[]; }

function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/\p{Diacritic}+/gu, '');
}

function tokenize(text: string): string[] {
  return stripAccents(text.toLowerCase())
    .split(/[^a-z0-9\u00e9\u00e8\u00ea\u00e0\u00f9\u00ee\u00ef\u00f4\u00e7]+/i)
    .map(t => t.trim())
    .filter(t => t.length >= 4);
}

const STOPWORDS = new Set([
  'the','this','that','with','from','have','been','will','would','could','there','their','about','into','after','before','while','over','under','also','such','more','less','than','between','where','whose','every','each','pour','dans','avec','cela','cette','ces','aux','des','les','une','nous','vous','elle','elles','mais','plus','moins','ainsi','dont','alors','comme','avoir','sont','etre','être','fait','faites','etre','elles','ils','elles','quelques','afin','chez','dont','pour','par','que','qui','quoi','quel','quelle','dont','leur','leurs','sur','vers','dans','tout','tous','toutes','ainsi','sans','selon']
);

function extractThemes(items: EditionNarrativeItem[], maxThemes = 4): Theme[] {
  const docs = items.map(it => {
    const text = [it.summary.abstract, ...it.summary.bullets].join(' ');
    const tokens = tokenize(text).filter(t => !STOPWORDS.has(t));
    return { item: it, tokens: new Set(tokens) };
  });
  const df: Record<string, number> = {};
  for (const d of docs) {
    for (const tok of d.tokens) df[tok] = (df[tok] || 0) + 1;
  }
  const N = docs.length;
  const candidates: ThemeCandidate[] = Object.keys(df).map(tok => {
    const idf = Math.log(1 + N / (1 + df[tok]));
    const relatedItems = docs.filter(d => d.tokens.has(tok)).map(d => d.item);
    const diversity = new Set(relatedItems.map(r => r.feed)).size;
    const score = idf * df[tok] * Math.log(1 + diversity);
    return { token: tok, score, items: relatedItems };
  });
  candidates.sort((a,b) => b.score - a.score);
  const selected: Theme[] = [];
  const usedTokens = new Set<string>();
  for (const c of candidates) {
    if (selected.length >= maxThemes) break;
    let similar = false;
    for (const u of usedTokens) {
      if (c.token.startsWith(u.slice(0,5)) || u.startsWith(c.token.slice(0,5))) { similar = true; break; }
    }
    if (similar) continue;
    usedTokens.add(c.token);
    const sources = Array.from(new Set(c.items.map(i => i.feed)));
    const titles = c.items.slice(0,2).map(i => i.title);
    selected.push({ label: c.token, sources, titles });
  }
  return selected;
}

function shortenFeedName(feedName: string): string {
  // Extract main feed name before common separators
  const patterns = [
    /^([^:—–\-]+)[\s]*[:—–\-]/, // "Pixels : Toute l'actualité..." -> "Pixels"
    /^(.*?)\s*\|\s*/, // "Site | Description" -> "Site"
  ];

  for (const pattern of patterns) {
    const match = feedName.match(pattern);
    if (match) {
      return match[1].trim();
    }
  }

  // If no pattern matches, return first 40 chars or full name
  return feedName.length > 40 ? feedName.slice(0, 40).trim() + '…' : feedName;
}

function generateAnalysisParagraphLegacy(items: EditionNarrativeItem[]): string {
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

function generateAnalysisParagraph(items: EditionNarrativeItem[]): string {
  if (items.length === 0) return "Aucune analyse approfondie n'est disponible pour cette édition.";
  if (items.length < 6) return generateAnalysisParagraphLegacy(items);
  const themes = extractThemes(items, 5);
  if (themes.length < 2) return generateAnalysisParagraphLegacy(items);
  const feeds = Array.from(new Set(items.map(i => i.feed)));

  // Build proper prose with citation tags
  const themeDescriptions: string[] = [];
  for (const th of themes.slice(0, 3)) {
    // Get actual items for this theme to create proper citation tags
    const themeItems = th.sources.slice(0, 2).map(sourceName =>
      items.find(item => item.feed === sourceName)
    ).filter(Boolean) as EditionNarrativeItem[];

    if (themeItems.length > 0) {
      const citations = themeItems.map(item =>
        `[↗ ${shortenFeedName(item.feed)}](${item.url})`
      ).join(' ');
      themeDescriptions.push(`Les développements autour de ${th.label} ${citations}`);
    }
  }

  let analysis = themeDescriptions.join(', ');
  if (feeds.length > 4) {
    analysis += `. Cette diversité de ${feeds.length} sources distinctes illustre l'ampleur des dynamiques en cours.`;
  }

  return analysis;
}

function enforceCharLimit(value: string, maxChars: number): string {
  if (value.length <= maxChars) return value;
  const soft = value.slice(0, maxChars);
  // Try to end at the last complete sentence within soft part
  const sentenceBoundary = soft.match(/[.!?](?=\s|$)(?!.*[.!?](?=\s|$))/);
  if (sentenceBoundary) {
    const idx = soft.lastIndexOf(sentenceBoundary[0]);
    if (idx >= Math.floor(maxChars * 0.6)) {
      return soft.slice(0, idx + 1).trim();
    }
  }
  // No acceptable boundary: return full original (avoid mid-sentence truncation)
  return value;
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
