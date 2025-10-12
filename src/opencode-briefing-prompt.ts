import type { EditionNarrativeItem } from "@/lib/types";

export function buildBriefingPrompt(
  items: EditionNarrativeItem[],
  timezone: string,
  targetWords: { overview: number; background: number; analysis: number },
  language: string = "French"
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

  return [
    `You are an analytical ${language} journalist writing a comprehensive daily briefing for informed readers.`,
    `Your task: synthesize multiple sources into a cohesive narrative that reveals connections and explains significance.`,
    `All text must be in ${language}.`,
    "",
    "Content structure (FOLLOW THESE LENGTHS):",
    `1. OVERVIEW (L'essentiel du jour): 4-5 substantial paragraphs, ~${targetWords.overview} words total`,
    "   - Open with the most significant development or unifying theme",
    "   - Connect 3-4 major themes across different stories",
    "   - Explain causal relationships and why events matter",
    "   - Include specific details: numbers, names, policy specifics, timelines",
    "",
    `2. BACKGROUND (Contexte): 2-3 paragraphs, ~${targetWords.background} words total`,
    "   - Provide historical context and precedents",
    "   - Explain structural forces shaping current events",
    "   - Identify key stakeholders and their motivations",
    "   - Show how past developments led to today's situation",
    "",
    `3. ANALYSIS (Analyse): 2-3 paragraphs, ~${targetWords.analysis} words total`,
    "   - Extract second-order implications",
    "   - Highlight tensions and contradictions",
    "   - Identify what to watch next",
    "   - Explain who wins/loses and what changes",
    "",
    "CRITICAL - Citation format:",
    "- Use ONLY this format: [↗ SourceName](URL)",
    "- SourceName = short feed name like 'Le Monde', 'Reuters'",
    "- Example: 'Data shows growth [↗ Le Monde](url1) despite warnings [↗ Reuters](url2)'",
    "- NEVER use parentheses like (Le Monde) or (Article title, Source)",
    "- Place citations inline, not at paragraph end",
    "",
    "Writing quality requirements:",
    "- DEPTH: Better to explore 4-5 stories deeply than list 20 superficially",
    "- SYNTHESIS: Find hidden connections between seemingly unrelated events",
    "- SPECIFICITY: Use concrete details (exact figures, named officials, policy articles, precise timelines)",
    "- CAUSAL CHAINS: Explain HOW things work (policy → impact → strategic response)",
    "- FORWARD-LOOKING: Identify emerging patterns and inflection points",
    "- NEUTRAL TONE: Authoritative but no partisan framing or hype",
    "",
    "Do NOT:",
    "- List articles sequentially ('In X, article A reports... Meanwhile, article B states...')",
    "- Use generic transitions ('On another note', 'Additionally', 'Furthermore')",
    "- Add section labels like 'Contexte:' or 'Analyse:' - the JSON structure handles that",
    "- Stack citations at paragraph end - weave them inline naturally",
    "",
    `Total target: ~${targetWords.overview + targetWords.background + targetWords.analysis} words (overview: ${targetWords.overview}, background: ${targetWords.background}, analysis: ${targetWords.analysis}).`,
    `Write entirely in ${language}.`,
    "",
    "Return JSON:",
    "{",
    `  "overview": "<4-5 substantial paragraphs, ~${targetWords.overview} words. Connect themes, explain causality, use specific details>",`,
    `  "background": "<2-3 paragraphs, ~${targetWords.background} words. Historical context, structural forces, stakeholders>",`,
    `  "analysis": "<2-3 paragraphs, ~${targetWords.analysis} words. Implications, tensions, forward-looking insights>",`,
    '  "timeline": [{"title":"...", "summary":"...", "date":"YYYY-MM-DD", "source":"...", "url":"..."}],',
    `  "fastFacts": ["..."],`,
    '  "furtherReading": [{"title":"...", "url":"...", "note":"..."}],',
    `  "readingMinutes": <calculated from word count>,`,
    '  "wordCount": <count>',
    "}",
    "",
    "Source stories (indexed):",
    stories || "No sources provided."
  ].join("\n");
}
