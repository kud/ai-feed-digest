import type { EditionNarrativeItem } from "@/lib/types";

export function buildEditionNarrativePrompt(items: EditionNarrativeItem[], language: string = "French"): string {
  const limited = items.slice(0, 18);
  const storyLines = limited
    .map(
      (item, index) => [
        `${index + 1}. [#${index + 1}] ${item.title} — ${item.feed}`,
        `   URL: ${item.url}`,
        `   Abstract: ${item.summary.abstract}`,
        `   Bullets: ${item.summary.bullets.slice(0, 3).join(" • ")}`
      ].join("\n")
    )
    .join("\n");

  return [
    `You are the editor-in-chief crafting a daily briefing, an articulate ${language} journalist with a refined yet accessible tone.`,
    "Maintain strict neutrality and avoid partisan framing.",
    `Deliver the synthesis entirely in ${language}, weaving all stories into a coherent narrative.`,
    "Structure 4–6 thematic paragraphs (~140–170 words each).",
    "EVERY paragraph must cite at least two distinct sources (if available).",
    "First citation of a source: [Exact Article Title](URL) (FeedName). Later you may reference it again with its index tag [#N] plus context if helpful.",
    "Cover ALL sources across the whole narrative; do not omit any article.",
    "Explain significance and connections; avoid speculation that isn’t supported by sources.",
    "Do not include bullet lists, headings, or meta-instructions in the output.",
    "NEVER fabricate titles, feeds, URLs, figures, or quotes.",
    "",
    "Stories (indexed):",
    storyLines || "No sources available."
  ].join("\n");
}
