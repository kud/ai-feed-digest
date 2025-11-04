import type { EditionNarrativeItem } from "@/lib/types";

// v5 Briefing prompt builder with expanded depth and analytical standards.
// Generates an instruction string for the model. All structural + quality
// constraints are enforced post-generation by the validator.
export function buildBriefingPrompt(
  items: EditionNarrativeItem[],
  timezone: string,
  targetWords: {
    synthesis: number;
    analysis: number;
    key_points: number;
    watch_points: number;
    curiosities: number;
    positives: number;
  },
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

  const totalWords = Object.values(targetWords).reduce((a, b) => a + b, 0);

  return [
    `You are an analytical ${language} journalist producing a DAILY BRIEFING (v5) for highly informed readers in timezone ${timezone}.`,
    `Write the entire briefing in ${language} with a refined, journalistic, analytical tone.`,
    `Your mission: fuse multi-source coverage into a cohesive, high-depth 6-section document that surfaces causal mechanisms, hidden linkages and actionable foresight.`,
    "",
    "════════════════════════ STRUCTURE (STRICT ORDER) ════════════════════════",
    "1. SYNTHÈSE DU JOUR (Panoramic unifying narrative)",
    "2. ANALYSE CRITIQUE (Second-order / mechanism-level thinking)",
    "3. POINTS À RETENIR (Concrete strategic takeaways)",
    "4. À SURVEILLER (Forward-looking radar)",
    "5. CURIOSITÉS (Thought-provoking, perspective broadeners)",
    "6. POINTS POSITIFS (Constructive / progress signals)",
    "Do NOT write section labels inside the prose—JSON keys will carry labels.",
    "",
    "════════════════════════ DEPTH & METHOD ════════════════════════",
    "SYNTHÈSE DU JOUR:",
    "  - MINIMUM 5-6 substantial paragraphs establishing the meta-theme of the day.",
    "  - Each paragraph must START WITH A CONCRETE FACT (event, name, figure, date)—NO abstract preambles.",
    "  - Interweave 3–5 major domains (économie, technologie, politique, climat, géopolitique).",
    "  - Use smooth TRANSITIONS between topics (« Parallèlement », « En miroir », « Cette dynamique »).",
    "  - Explicit causal chains (politique → incitations → comportements → effets).",
    "  - Rich specifics: chiffres exacts, personnes nommées, dates précises, instruments politiques.",
    "  - FORBIDDEN: Generic phrases like « Les développements autour de... », « Dans ce contexte... » without specifics.",
    "ANALYSE CRITIQUE:",
    "  - MINIMUM 6-8 substantial paragraphs of deep reasoning.",
    "  - Each paragraph applies 3-part analytical lens:",
    "    • Signal révélé (dynamique cachée / tension / déplacement de pouvoir)",
    "    • Importance (quels acteurs gagnent/perdent, implications structurelles)",
    "    • Contre-interprétations ou incertitudes (nuances, scénarios alternatifs)",
    "  - REQUIRED: Cross-theme connections (tech ↔ politique, écologie ↔ économie).",
    "  - Asymmetric consequences, second-order & downstream effects.",
    "  - Explicit stance or interpretation (analytical, non-ideological).",
    "  - NO FILLER or placeholder text—every sentence must add analytical value.",
    "POINTS À RETENIR:",
    "  - MINIMUM 4-5 paragraphs, each = one distilled takeaway with supporting specifics.",
    "  - Actionable insights, not mere restatements of facts.",
    "À SURVEILLER:",
    "  - MINIMUM 3-4 paragraphs with emerging inflection points, dates clés à venir, métriques / seuils à observer.",
    "  - Forward-looking, anticipatory analysis.",
    "CURIOSITÉS:",
    "  - MINIMUM 3 paragraphs: Surprising, paradoxical ou contre-intuitif mais intellectuellement solide (pas de trivia).",
    "  - Thought-provoking questions or reflections that broaden perspective.",
    "POINTS POSITIFS:",
    "  - MINIMUM 3 paragraphs: Réels signaux constructifs (innovations, progrès mesurable, initiatives efficaces).",
    "  - REQUIRED: This section must ALWAYS be included with meaningful, hopeful outcomes.",
    "",
    "════════════════════════ CITATIONS (MANDATORY INLINE) ════════════════════════",
    "Format: [↗ SourceName](URL) placed exactly where a fact is introduced.",
    "Distribute naturally across sections. Avoid citation stacking at ends of paragraphs.",
    "Use short source names (e.g. 'Le Monde', 'Reuters', 'Ars Technica').",
    "",
    "════════════════════════ QUALITY PRINCIPLES ════════════════════════",
    "✓ Connexions trans-domaines explicites (tech/politique, climat/économie, sécurité/énergie).",
    "✓ Spécificité et granularité factuelle (pas de généralités vagues).",
    "✓ Transitions fluides sans formules génériques (éviter 'Par ailleurs', 'De plus').",
    "✓ Ton neutre, analytique, non sensationnaliste.",
    "✓ Foresight: articulation de ce qui pourrait suivre et pourquoi.",
    "✓ SOURCE PRIORITIZATION: Prioritize critical and generalist sources (Le Monde, Libération, Reporterre, Futura, Mr Mondialisation, The Conversation).",
    "✓ Limit lifestyle/product sources (Product Hunt, Secret London) to <10% of total content weight.",
    "✓ Ensure 6–12 unique sources are represented across sections.",
    "✗ Interdits: listage séquentiel d'articles, paragraphes fourre-tout, citations groupées en fin, chevauchement excessif.",
    "",
    "════════════════════════ LENGTH REQUIREMENTS (MANDATORY MINIMUMS) ════════════════",
    `CRITICAL: Total output MUST be ≥ ${totalWords} words. This is a MINIMUM, not a target.`,
    `Section MINIMUM word counts (strictly enforced):`,
    `  - Synthèse du jour ≥ ${targetWords.synthesis} words (longest section)`,
    `  - Analyse critique ≥ ${targetWords.analysis} words (second longest—deep analytical reasoning)`,
    `  - Points à retenir ≥ ${targetWords.key_points} words`,
    `  - À surveiller ≥ ${targetWords.watch_points} words`,
    `  - Curiosités ≥ ${targetWords.curiosities} words`,
    `  - Points positifs ≥ ${targetWords.positives} words`,
    "PRIORITY: Completeness and analytical depth over brevity. If substantive reasoning requires more words, USE THEM.",
    "DO NOT artificially compress analysis to meet arbitrary brevity—journalistic richness is required.",
    "",
    "════════════════════════ RETURN STRICTLY AS JSON ════════════════════════",
    "{",
    `  "synthesis": "<multi-paragraph panoramic narrative>",`,
    `  "analysis": "<multi-paragraph deep mechanism-level reasoning>",`,
    `  "key_points": "<paragraphs of distilled takeaways>",`,
    `  "watch_points": "<paragraphs with forward-looking items>",`,
    `  "curiosities": "<paragraphs of intellectually stimulating insights>",`,
    `  "positives": "<paragraphs of genuine constructive developments>",`,
    `  "timeline": [{"title":"...","summary":"...","date":"YYYY-MM-DD","source":"...","url":"..."}],`,
    `  "fastFacts": ["..."],`,
    `  "furtherReading": [{"title":"...","url":"...","note":"..."}],`,
    `  "readingMinutes": <integer>,`,
    `  "wordCount": <integer total across sections>`,
    "}",
    "No additional commentary outside JSON. Do not repeat instructions.",
    "",
    "════════════════════════ SOURCE STORIES (INDEXED) ════════════════════════",
    stories || "No sources provided."
  ].join("\n");
}
