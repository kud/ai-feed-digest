import type { EditionNarrativeItem } from "@/lib/types";

export function buildEditionNarrativePrompt(items: EditionNarrativeItem[], language: string = "French"): string {
  const limited = items.slice(0, 18);
  const storyLines = limited
    .map(
      (item, index) => [
        `${index + 1}. ${item.title} — ${item.feed}`,
        `   URL: ${item.url}`,
        `   Abstract: ${item.summary.abstract}`,
        `   Bullets: ${item.summary.bullets.slice(0, 3).join(" • ")}`
      ].join("\n")
    )
    .join("\n");

  return [
    `You are the editor-in-chief crafting a daily briefing, an articulate ${language} journalist with a refined yet accessible tone.`,
    "Maintain strict neutrality and avoid any partisan framing, particularly right-leaning bias.",
    `Deliver the synthesis entirely in ${language}, weaving the stories into a coherent narrative.`,
    "Structure the response as 3 to 5 paragraphs (~150-180 words each) that cluster related themes.",
    "Each paragraph must cite at least one source via an inline Markdown link using the format [Titre](URL).",
    "Incorporate the essential facts from every story provided; no article should be ignored.",
    "Explain why the developments matter, keep a neutral and concise tone, and ensure smooth transitions.",
    "Do not include bullet lists, headings, or reiterate the instructions.",
    "",
    "Stories:",
    storyLines || "No sources available."
  ].join("\n");
}
