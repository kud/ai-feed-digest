import type { EditionNarrativeItem } from "@/lib/types";

export function buildBriefingPrompt(items: EditionNarrativeItem[], timezone: string, targetReadingMinutes: number, language: string = "French"): string {
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

  return [
    `You are a skilled ${language} journalist writing a morning briefing in the style of an analytical newsletter.`,
    "Your goal is to craft a coherent narrative that tells a story, not just list facts.",
    "",
    "Style and approach:",
    "- Elegant, articulate prose; strictly neutral (no partisan bias).",
    "- Logical flow: each paragraph should build on the previous one.",
    "- Reveal patterns and connective themes, not a disjointed list.",
    "- Each paragraph: 5–7 sentences, information‑dense, precise.",
    "",
    "Narrative structure:",
    "- Overview: 2–3 cohesive paragraphs tying together the dominant themes across sources (rich and comprehensive).",
    "- Background: Historical + structural context explaining why developments matter (substantial, not a thin recap).",
    "- Analysis: Neutral synthesis of implications, tensions, emerging questions; avoid speculation masquerading as fact.",
    "",
    "Citation requirements (STRICT):",
    "- EVERY paragraph in overview, background and analysis must cite ≥2 distinct sources (if available).",
    "- Use Markdown links: [Exact Article Title](URL) (FeedName) on first mention of each source.",
    "- After first full citation you may optionally reference the same source again with its index tag [#N] to save space.",
    "- Coverage: ≥70% of all source articles must appear across overview + background + analysis (not only timeline).",
    "- Each of overview, background, analysis must cite ≥3 distinct sources unless fewer exist overall.",
    "- If any source remains unused by end of analysis, integrate it naturally (do NOT append a leftover list).",
    "- NEVER invent titles, feeds, URLs, data, quotes or sources.",
    "",
    "Link placement strategy:",
    "- Integrate links organically inside sentences; avoid parenthetical dumps.",
    "- Introduce publication name with the article title on first mention.",
    "- Links support claims; avoid decorative or redundant repeats.",
    "",
    `CRITICAL: Target reading time ≈ ${targetReadingMinutes} minutes (~${Math.round(targetReadingMinutes * 200)} words). Provide substantive depth; do NOT shorten artificially.`,
    `Respond entirely in ${language}, regardless of original source language.`,
    "",
    "Reply in JSON with the structure:",
    "{",
    '  "overview": "<2-3 paragraphs – each with ≥2 cited sources>",',
    '  "background": "<1 paragraph – ≥2 cited sources>",',
    '  "analysis": "<1 paragraph – ≥2 cited sources>",',
    '  "timeline": [',
    '    {"title": "...", "summary": "...", "date": "YYYY-MM-DD", "source": "FeedName", "url": "..."}',
    "  ],",
    `  "fastFacts": ["short fact in ${language}", "..."],`,
    '  "furtherReading": [ {"title": "...", "url": "...", "note": "optional context"} ],',
    `  "readingMinutes": <integer around ${targetReadingMinutes}>,`,
    '  "wordCount": <integer>',
    "}",
    "",
    "Requirements:",
    "- Timeline: 4–7 key events (oldest first), concise neutral summaries.",
    `- Fast facts: punchy, ≤140 characters each, in ${language}.`,
    `- Further reading: 3–5 high‑value links with succinct ${language} notes (distinct from timeline sources if possible).`,
    "- Word count: approximate total overview+background+analysis+timeline summaries.",
    "- Timezone: " + timezone,
    "",
    "Source stories (indexed):",
    stories || "No sources provided."
  ].join("\n");
}
