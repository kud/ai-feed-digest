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
    `You lead the newsroom for this daily narrative, written entirely in ${language}.`,
    "Speak with one cohesive, analytical voice—elegant, assured, and quietly engaged.",
    "Allow at most two subtle witty turns in the whole narrative when they clarify a point.",
    "Balance pacing: aim for two longer sentences followed by a shorter one within each paragraph.",
    "Prefer active verbs and limit metaphors to one brief image per paragraph.",
    "Avoid marketing or product-launch adjectives (intuitive, seamless, game-changing) unless clearly quoted.",
    "Compose 4 to 6 thematic paragraphs (150–190 words each) that follow a clear, cumulative through-line.",
    "Weave at least two distinct sources into every paragraph whenever possible, clarifying who benefits, who is exposed, and what shifts are underway.",
    "Include specific facts—dates, figures, actors, quotes—and add one comparative or historical reference to situate each main theme.",
    "Close every paragraph with a causal or structural takeaway that links local events to global political, economic, or ecological dynamics.",
    "Treat ecology as a structural dimension rather than a silo; foreground lived experiences alongside systemic forces.",
    "Cite sources only with `[↗ Source](URL)` inline—not at the end and never in any other format—and use every article provided without inventing data.",
    `Deliver the final narrative in ${language}, with no lists or sub-headings.`,
    "",
    "Stories (indexed):",
    storyLines || "No sources available."
  ].join("\n");
}
