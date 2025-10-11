import type { EditionNarrativeItem } from "@/lib/types";

export function buildBriefingPrompt(items: EditionNarrativeItem[], timezone: string, targetReadingMinutes: number, language: string = "French"): string {
  const stories = items
    .map((item, index) =>
      [
        `${index + 1}. ${item.title} (${item.feed})`,
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
    "- Adopt elegant, articulate prose while remaining neutral and avoiding any partisan bias.",
    "- Build a logical progression of ideas where each paragraph flows naturally into the next.",
    "- Create thematic connections between stories to reveal underlying patterns and trends.",
    "- Use transitions that guide the reader through your narrative arc.",
    "- Each paragraph should run 5–7 sentences with precise facts, figures, or paraphrased quotes.",
    "",
    "Link placement strategy:",
    "- Place links organically within the narrative flow, not randomly in parentheses.",
    "- Introduce each source naturally with both the publication name and article title: 'Comme le révèle [titre exact] dans Le Monde...', 'Selon une enquête [titre] de Pixels...', etc.",
    "- Always mention the source publication (feed name) when introducing an article.",
    "- Links should support your argument, not interrupt it.",
    "- Use Markdown format: [Titre de l'article](URL)",
    "- Every source article must be referenced at least once in overview, background, or analysis sections with its source publication clearly identified.",
    "",
    "Narrative structure:",
    "- Overview: Establish the main thread(s) of the day by identifying common themes across stories. Show how individual events connect to form a bigger picture. This section should be rich, detailed, and comprehensive.",
    "- Background: Provide historical and contextual depth that explains why today's events matter. Connect current developments to longer-term trends. Add significant context and detail.",
    "- Analysis: Offer neutral but insightful interpretation of implications, tensions, and questions raised by the day's news. Be thorough and analytical.",
    "",
    `CRITICAL: Target reading time is ${targetReadingMinutes} minutes of substantive, analytical content.`,
    `This means approximately ${Math.round(targetReadingMinutes * 200)} words across all sections (overview + background + analysis + timeline summaries).`,
    `Write comprehensive, detailed analysis. Each section should be substantial. Do not write brief summaries.`,
    `Respond entirely in ${language}, regardless of source language.`,
    "",
    "Reply in JSON with the structure:",
    "{",
    '  "overview": "<2-3 cohesive paragraphs that establish the main narrative arc>",',
    '  "background": "<one paragraph providing historical/contextual depth>",',
    '  "analysis": "<one paragraph with neutral implications and synthesis>",',
    '  "timeline": [',
    '    {"title": "...", "summary": "...", "date": "YYYY-MM-DD", "source": "...", "url": "..."}',
    "  ],",
    `  "fastFacts": ["short fact in ${language}", "..."],`,
    '  "furtherReading": [ {"title": "...", "url": "...", "note": "optional"} ],',
    `  "readingMinutes": <integer around ${targetReadingMinutes}>,`,
    '  "wordCount": <integer>',
    "}",
    "",
    "Requirements:",
    "- Timeline: 4–7 key events, chronological order (oldest first).",
    `- Fast facts: punchy, ≤ 140 characters each, in ${language}.`,
    `- Further reading: 3–5 compelling links with short ${language} notes.`,
    "- Word count: approximate total across overview/background/analysis/timeline summaries.",
    "- Timezone: " + timezone,
    "",
    "Source stories:",
    stories || "No sources provided."
  ].join("\n");
}
