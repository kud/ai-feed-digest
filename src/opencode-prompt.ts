import { SummariseInput } from "@/lib/types";

export function detectLanguage(text: string): string {
  // Simple heuristic: check for common French vs English words
  const frenchIndicators = /\b(le|la|les|des|une?|ce|cette|ces|dans|avec|pour|sur|son|ses|qui|que|dont|où|au|aux|du|de|et)\b/gi;
  const englishIndicators = /\b(the|a|an|and|or|of|to|in|on|for|with|this|that|these|those|is|are|was|were|has|have|will|would)\b/gi;

  const frenchMatches = (text.match(frenchIndicators) || []).length;
  const englishMatches = (text.match(englishIndicators) || []).length;

  if (englishMatches > frenchMatches && englishMatches >= 2) {
    return "English";
  }
  return "French";
}

export function buildOpenCodePrompt(input: SummariseInput, language: string = "French"): string {
  const includeUrl = String(process.env.INCLUDE_SOURCE_URL_IN_PROMPT || "true").toLowerCase() !== "false";
  const shortBody = (input.text || "").trim().length < 120;
  const titleLang = detectLanguage(input.title);
  const needsTranslation = language === "French" && titleLang === "English";

  return [
    `You are a seasoned ${language}-speaking journalist, articulate and elegant, with a neutral, non-partisan tone (avoid ideological framing).`,
    "You are preparing a concise structured news note from a single source.",
    `Always produce the final abstract and bullet points in ${language}, even when the source is in another language.`,
    needsTranslation ? `IMPORTANT: The article title is in English. Translate it to ${language} and include it as TITLE.` : "",
    "Never state you cannot access or browse the article; all required information is provided below.",
    "If concrete data (figures, dates, names) is missing, acknowledge absence briefly instead of refusing.",
    "Use placeholders like 'Détails chiffrés non communiqués' when quantitative details are absent.",
    shortBody ? "The article body is minimal. Still produce an informative abstract and 3 precise bullets." : "",
    "",
    "REQUIRED OUTPUT FORMAT (STRICT):",
    needsTranslation ? `TITLE: <translated title in ${language}>` : "",
    `ABSTRACT: <1–2 sentences in ${language} summarising core development and context>`,
    `- <key point 1 in ${language}>`,
    `- <key point 2 in ${language}>`,
    `- <key point 3 in ${language}>`,
    "",
    needsTranslation
      ? `CRITICAL: Output MUST start with TITLE line (translated), then ABSTRACT line, then exactly 3 bullet lines each beginning with '- '.`
      : "CRITICAL: Output MUST contain exactly one ABSTRACT line followed by exactly 3 bullet lines each beginning with '- '.",
    "No extra commentary, headings, disclaimers, apologies, markdown formatting, numbering or analysis outside this format.",
    "Do NOT add quotes from the article verbatim; paraphrase naturally.",
    "",
    "Guidelines:",
    "- Neutral, fact-focused, specific language.",
    "- Prioritise concrete facts (qui, quoi, quand, où, pourquoi / who, what, when, where, why).",
    `- Paraphrase in natural ${language}; do not mirror source phrasing.`,
    "- Note clearly when key data is absent (ex: 'date non précisée').",
    "- Keep bullets focused; avoid redundancy with the abstract.",
    "",
    `Article title: ${input.title}`,
    needsTranslation ? `(Title language: ${titleLang} → translate)` : "",
    includeUrl ? `Source URL: ${input.url}` : "",
    "",
    "Article body:",
    input.text
  ].filter(Boolean).join("\n");
}
