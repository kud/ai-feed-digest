import type { EditionNarrativeItem } from "@/lib/types";

const SUMMARY_OF_DAY_TARGET = 1200;
const CRITICAL_ANALYSIS_TARGET = 1050;
const POSITIVES_TARGET = 360;
const EDITION_TOTAL_TARGET = 3300;

export function buildBriefingPrompt(
  items: EditionNarrativeItem[],
  timezone: string,
  language: string = "French",
  attempt: number = 1
): string {
  const stories = items
    .map((item, index) =>
      [
        `${index + 1}. [#${index + 1}] ${item.title} — ${item.feed}`,
        `   URL: ${item.url}`,
        `   Published: ${item.publishedAt}`,
        `   Abstract: ${item.summary.abstract}`,
        `   Bullets: ${item.summary.bullets.join(" • ")}`
      ].join("\n")
    )
    .join("\n");

  const instructions = [
    `You are the editor-in-chief of a long-form daily edition delivered in ${language}.`,
    "Maintain one cohesive, analytical voice that combines elegance with quiet resolve.",
    "Allow up to two subtle witty or ironic turns per section when they sharpen the point.",
    "Balance rhythm: aim for two longer sentences followed by a shorter one in each paragraph.",
    "Prefer active verbs that show agency and consequence, using analytical connectors such as car, puisque, ainsi, de sorte que.",
    "Introduce at most one short metaphor per paragraph and avoid atmospheric imagery after the opening scene.",
    "Write for an informed, progressive, ecologically aware audience; keep the prose clear, elegant, never didactic.",
    "Each paragraph must contain at least one concrete fact (number, date, actor, quote fragment) and close with a clear causal or systemic insight.",
    "Every paragraph in the long sections must include at least one inline citation using the format [↗ Source](URL).",
    "Prefer completeness over brevity; expand with data, examples, and causal explanation whenever possible.",
    "Avoid marketing or product-launch adjectives (intuitif, innovant, gratuit, game-changing) and stock fillers such as “Cette trajectoire laisse entrevoir…”.",
    "Collapse identical sources so that repeated URLs appear only once as [↗ Source](URL) within a section.",
    "Vary verbs (analyse, révèle, transforme, accentue, implique) to avoid repetitive phrasing and include causal verbs such as expose, révèle, fragilise, renforce, transforme.",
    "",
    "Section blueprint (preserve the official French headings exactly in this canonical order—no stylistic variations):",
    `1. Synthèse du jour — Provide an optional narrative opening of at most three sentences (italicised) followed by 4 to 5 thematic blocks covering 4–5 major events linked by cause or consequence. Deliver ${SUMMARY_OF_DAY_TARGET} words (acceptable range 1 000–1 400). Keep imagery minimal after the opening and give each block a distinct focus, concrete data, and at least two [↗ Source](URL) citations.`,
    `2. Analyse critique — Write 4 to 6 paragraphs totalling ${CRITICAL_ANALYSIS_TARGET} words (acceptable range 900–1 200). The section must read like an editorial, not a recap: each paragraph must include at least one causal verb (expose, révèle, fragilise, renforce, transforme), articulate who gains or loses, and end with an explicit takeaway sentence. Provide at least two cross-theme links (for example ecology ↔ economy, politique ↔ société).`,
    "3. Points à retenir — Supply 5 to 7 factual one-liners (≤ 200 characters each) structured as actor + action + impact with concrete figures and one inline source per bullet.",
    "4. À surveiller — List 4 to 6 milestones with a date (YYYY-MM-DD or clear horizon), a named indicator, the expected consequence, and an inline [↗ Source](URL).",
    "5. Curiosités — Pose 1 to 3 open questions (no summaries) that surface blind spots or emerging dynamics; each question must carry a source citation.",
    "6. Points positifs — Provide 2 to 3 short paragraphs (~120–180 words each) highlighting constructive progress, explaining the structural reasons it matters, and citing at least one source per paragraph.",
    "Each section must fulfil a distinct editorial function; never recycle sentences, bullets, or phrasing from another section. Maintain distinct vocabulary between sections (aim for Jaccard similarity below 0.4 between 'Synthèse du jour' and 'Analyse critique').",
    "Each section must contain between two and five distinct sources; use at least two different [↗ Source](URL) references and cap at five per section. Do not reuse the same quotation or sentence verbatim.",
    "Within 'Synthèse du jour', cover at least four distinct themes (politics, economy, society, climate, technology) and show how they interrelate.",
    "Within 'Analyse critique', include at least one sentence that explicitly addresses systemic consequences (for example, 'At the systemic level...' or 'Structurellement...').",
    "Ensure every paragraph across the long sections contains at least one inline citation using the pattern [↗ Source](URL).",
    "",
    `Write everything in ${language}. Integrate ecological thinking across the edition, connect local facts to global dynamics, include concrete data (dates, figures, names) in every section, and add at least one human-scale reflection.`,
    "For every major event, provide specific data (dates, actors, figures, places) and add a comparative or historical sentence to show systemic meaning.",
    "Every theme must connect local facts to political, economic, or ecological structures and mention at least one forward-looking hypothesis when relevant.",
    "Mention at least once a tension linked to ecology, social justice, or governance, with explicit vocabulary naming that field.",
    "",
    "Citation rule: use only `[↗ Source](URL)` inline within sentences; spread references naturally, include every available source, and avoid duplicates inside a section.",
    "",
    `Generate roughly ${EDITION_TOTAL_TARGET} words in total (target range 3 000–3 500): ~${SUMMARY_OF_DAY_TARGET} for "Synthèse du jour", ~${CRITICAL_ANALYSIS_TARGET} for "Analyse critique", and the remaining distributed across the shorter sections.`,
    "Ensure the combined output exceeds 2 800 words and reject any draft that falls short.",
    "Never use the phrase “Les développements autour de”. Reject any draft where 'Analyse critique' falls below 300 words or omits its editorial stance.",
    "Reject any draft where a sentence appears twice within the same section.",
    "",
    "Return JSON matching exactly:",
    "{",
    `  "summaryOfDay": "<Section 'Synthèse du jour' (~${SUMMARY_OF_DAY_TARGET} words) with paragraphs that include data, comparisons, and inline citations>",`,
    `  "criticalAnalysis": "<Section 'Analyse critique' (~${CRITICAL_ANALYSIS_TARGET} words) with each paragraph closing on a structural insight and causal verb>",`,
    '  "pointsToRemember": ["<actor + action + impact with citation>", "..."],',
    '  "toWatch": [{"title":"<event or dossier>","detail":"<why it matters with citation>","date":"YYYY-MM-DD or text","indicator":"<metric or signal>","source":"<source name>","url":"<link>"}],',
    '  "curiosities": ["<open question with citation>", "..."],',
    `  "positiveNotes": ["<paragraph (~${Math.round(POSITIVES_TARGET / 3)} words) explaining a positive signal and its systemic impact, with citation>", "..."],`,
    '  "readingMinutes": <integer>,',
    '  "wordCount": <integer>',
    "}",
    "",
    "Indexed source material:",
    stories || "No sources provided."
  ];

  if (attempt > 1) {
    instructions.unshift(
      `Previous attempt was rejected for structural regressions. On attempt ${attempt}, strictly apply section intent, eliminate repeated sentences, avoid the phrase "Les développements autour de", and ensure every section includes 2 to 5 distinct sources with no duplicates.`
    );
  }

  return instructions.join("\n");
}
