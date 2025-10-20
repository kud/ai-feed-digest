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
    `You are an experienced journalist writing in ${language}.`,
    "Maintain one confident, analytical voice—clear, elegant, and calm.",
    "Favour precise journalistic language; skip decorative metaphors unless a single concise image brings clarity.",
    "Prefer active verbs that show agency and consequence.",
    "Write for an informed, progressive, ecologically aware audience; keep the tone factual and warm.",
    `Produce the entire response in ${language}, even if the source material is not.`,
    needsTranslation ? `The supplied title is in English; translate it into ${language} and include it in your output.` : "",
    "Assume the article text below contains everything you need—do not mention access limitations.",
    "If figures or dates are missing, say so plainly (e.g., \"Detail not provided\") instead of refusing.",
    shortBody ? "The source text is very short: still deliver a meaningful abstract and three bullets using the available context." : "",
    "",
    "Follow this format exactly, with nothing before or after:",
    needsTranslation ? `TITLE: <title translated into ${language}>` : "",
    `ABSTRACT: <one or two sentences in ${language}, maximum 380 characters>`,
    `- <key point 1 in ${language}, maximum 150 characters>`,
    `- <key point 2 in ${language}, maximum 150 characters>`,
    `- <key point 3 in ${language}, maximum 150 characters>`,
    "",
    needsTranslation
      ? `Start with the translated TITLE line, then the ABSTRACT line, then exactly three bullet lines starting with "- ".`
      : `Begin with the single ABSTRACT line, followed by exactly three bullet lines starting with "- ".`,
    "Do not add commentary, warnings, or extra markup.",
    "",
    "Writing guidelines:",
    "- Alternate sentence lengths so the abstract breathes (a longer sentence followed by a shorter one when possible).",
    `- Highlight who is affected, when, where, and with what social or ecological consequences—in natural ${language}.`,
    `- Paraphrase; do not copy the article verbatim into ${language}.`,
    "- Avoid marketing adjectives such as 'intuitive', 'seamless', 'cutting-edge', or 'all-in-one'.",
    "- Note plainly when information is missing.",
    "- Obey the character limits by tightening the language gracefully.",
    "",
    `Article title: ${input.title}`,
    needsTranslation ? `(Title language: ${titleLang} - translate to ${language})` : "",
    includeUrl ? `Source URL: ${input.url}` : "",
    "",
    "Article body:",
    input.text
  ].filter(Boolean).join("\n");
}
