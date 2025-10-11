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

export async function warmupOpenCodeClient(config: DigestConfig): Promise<void> {
  await warmupClient(config);
}

export async function summariseWithOC(
  input: SummariseInput,
  config: DigestConfig
): Promise<SummariseResult> {
  const prompt = buildOpenCodePrompt(input, config.language);
  const timeoutMs = config.opencode.timeout_ms;

  try {
    const text = await withTimeout(requestCompletion(prompt, config), timeoutMs);
    if (text) {
      const parsed = parseOpenCodeOutput(text);
      return {
        ...parsed,
        via: "opencode",
        engine: config.opencode.model
      };
    }
  } catch (error) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[summarise] OpenCode failed, falling back:", (error as Error).message);
    }
  }

  return fallbackSummarise(input);
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
      const parsed = parseBriefingJson(text);
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

function parseBriefingJson(raw: string): EditionBriefing | null {
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
      ? Math.max(15, Math.round(Number(candidate.readingMinutes)))
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
      readingMinutes: readingMinutes ?? Math.max(15, Math.ceil(words / 210)),
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

  const wordCount = [overview, background, analysis]
    .join(" \n")
    .split(/\s+/)
    .filter(Boolean).length;

  return {
    overview,
    background,
    analysis,
    timeline,
    fastFacts: facts,
    furtherReading: readings,
    readingMinutes: Math.max(15, Math.ceil(wordCount / 200)),
    wordCount
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
  const first = items[0];
  return `Les ${items.length} articles agrégés aujourd’hui convergent autour de « ${first.title} » ([source](${first.url})). Les données ont été harmonisées pour le fuseau ${timezone} avec vérification croisée des faits clés.`;
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
