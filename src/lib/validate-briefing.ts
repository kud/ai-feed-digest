import type { EditionBriefing, DigestConfig, EditionNarrativeItem } from "./types";

export interface BriefingValidationMetrics {
  wordCounts: Record<string, number>;
  paragraphCounts: Record<string, number>;
  citationsPerSection: Record<string, number>;
  citationsPerParagraphAvg: Record<string, number>;
  englishLeakRatio: number;
  uniqueCitationSources: number;
}

export interface BriefingValidationResult {
  ok: boolean;
  reasons: string[];
  metrics: BriefingValidationMetrics;
}

const EN_STOP = new Set([
  "the","and","with","from","have","been","will","would","could","there","their","about","into","after","before","while","over","under","also","such","more","less","than","between","where","whose","every","each","during","against","without","within"
]);

// Extract citations of form [↗ SourceName](http...) and return array of {raw, source}
function extractCitations(text: string) {
  const rx = /\[↗\s+([^\]]{1,60})\]\(https?:[^)]+\)/g;
  const result: { raw: string; source: string }[] = [];
  let m: RegExpExecArray | null;
  while ((m = rx.exec(text))) {
    result.push({ raw: m[0], source: m[1].trim() });
  }
  return result;
}

function splitParagraphs(text: string): string[] {
  // Prefer double newlines; fallback to sentence grouping if none
  const blocks = text.trim().split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
  if (blocks.length > 1) return blocks;
  // Sentence based fallback: group every 2-3 sentences as pseudo paragraph
  const sentences = text.split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s.length > 0);
  const paras: string[] = [];
  let buf: string[] = [];
  for (const s of sentences) {
    buf.push(s);
    if (buf.length >= 3 || s.length > 160) {
      paras.push(buf.join(" ")); buf = [];
    }
  }
  if (buf.length) paras.push(buf.join(" "));
  return paras.length ? paras : (text ? [text] : []);
}

export function validateBriefing(
  briefing: EditionBriefing,
  config: DigestConfig,
  items: EditionNarrativeItem[]
): BriefingValidationResult {
  const targets = config.digest.target_words;
  const sections: Record<string, string> = {
    synthesis: briefing.synthesis,
    analysis: briefing.analysis,
    key_points: (briefing.key_points ?? (briefing as any).keyPoints ?? ""),
    watch_points: (briefing.watch_points ?? (briefing as any).watchPoints ?? ""),
    curiosities: briefing.curiosities,
    positives: briefing.positives
  };

  const wordCounts: Record<string, number> = {};
  const paragraphCounts: Record<string, number> = {};
  const citationsPerSection: Record<string, number> = {};
  const citationsPerParagraphAvg: Record<string, number> = {};
  const reasons: string[] = [];

  let totalEnglishTokens = 0;
  let totalTokens = 0;
  const allCitationSources = new Set<string>();

  for (const [key, value] of Object.entries(sections)) {
    const words = value.split(/\s+/).filter(Boolean);
    wordCounts[key] = words.length;
    const paras = splitParagraphs(value);
    paragraphCounts[key] = paras.length;
    const citations = extractCitations(value);
    citationsPerSection[key] = citations.length;
    citations.forEach(c => allCitationSources.add(c.source));
    citationsPerParagraphAvg[key] = paras.length ? citations.length / paras.length : 0;

    // English leakage measurement
    for (const w of words) {
      const token = w.toLowerCase().replace(/[^a-z]/g, "");
      if (!token) continue;
      totalTokens++;
      if (EN_STOP.has(token)) totalEnglishTokens++;
    }

    // Word count stricter threshold (≥95% of target)
    const target = (targets as Record<string, number | undefined>)[key];
    if (typeof target === "number" && words.length < target * 0.95) {
      reasons.push(`Section ${key} below 95% target (${words.length}/${target})`);
    }

    // Paragraph minimums (increased for better depth)
    const paraMin: Record<string, number> = {
      synthesis: 6,
      analysis: 8,
      key_points: 5,
      watch_points: 4,
      curiosities: 4,
      positives: 4
    };
    if (paragraphCounts[key] < paraMin[key]) {
      reasons.push(`Section ${key} insufficient paragraphs (${paragraphCounts[key]} < ${paraMin[key]})`);
    }

    // Citation density: at least 0.6 per paragraph & no paragraph-free citations
    if (paras.length > 0 && citationsPerParagraphAvg[key] < 0.6) {
      reasons.push(`Section ${key} low citation density (${citationsPerParagraphAvg[key].toFixed(2)}/para)`);
    }
  }

  // English leakage ratio
  const englishLeakRatio = totalTokens ? totalEnglishTokens / totalTokens : 0;
  if (englishLeakRatio > 0.02) {
    reasons.push(`English leakage above 2% (${(englishLeakRatio * 100).toFixed(2)}%)`);
  }

  // Source diversity heuristic: expect ≥ min(2, items.length) unique cited sources
  const uniqueCitationSources = allCitationSources.size;
  const requiredSources = Math.min(2, Math.max(1, new Set(items.map(i => i.feed)).size));
  if (uniqueCitationSources < requiredSources) {
    reasons.push(`Insufficient cited source diversity (${uniqueCitationSources}/${requiredSources})`);
  }

  const ok = reasons.length === 0;
  return {
    ok,
    reasons,
    metrics: {
      wordCounts,
      paragraphCounts,
      citationsPerSection,
      citationsPerParagraphAvg,
      englishLeakRatio,
      uniqueCitationSources
    }
  };
}

// Simple metrics accumulator for external inspection
const validationTally: Record<string, number> = {};
export function recordValidation(result: BriefingValidationResult) {
  validationTally[result.ok ? "valid" : "invalid"] = (validationTally[result.ok ? "valid" : "invalid"] || 0) + 1;
  for (const r of result.reasons) {
    const key = `reason:${r.split(" ")[0]}`; // coarse grouping
    validationTally[key] = (validationTally[key] || 0) + 1;
  }
}
export function getValidationTally() { return { ...validationTally }; }
