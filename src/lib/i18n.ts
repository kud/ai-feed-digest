export type Language = "fr" | "en";

export const DEFAULT_LANGUAGE: Language = "fr";

export const translations = {
  fr: {
    // Header
    siteTitle: "Revue Quotidienne",
    siteSubtitle: "L'essentiel du jour",
    skipToContent: "Aller au contenu",

    // Edition page
    stories: "articles",
    viewArchive: "Voir les archives",
    curatedLinks: "liens sélectionnés",
    readingTime: "Temps de lecture estimé",
    minutes: "minutes",
    words: "mots environ",

    // Summary origins
    summaryOpenCode: "Résumé par IA",
    summaryFallback: "Résumé automatique",

    // Archive page
    archiveTitle: "Archives des éditions",
    archiveDescription: "Toutes les éditions précédentes de la Revue Quotidienne.",
    backToLatest: "← Dernière édition",

    // Footer
    footerText: "Créé avec Markdown, résumés OpenCode et Next.js.",

    // Date formatting
    locale: "fr-FR",

    // Sections (from markdown generation)
    todayAtAGlance: "Aujourd'hui en un coup d'œil",
    background: "À l'origine",
    keyDates: "Les dates clés",
    analysis: "Analyse",
    didYouKnow: "Le saviez-vous ?",
    furtherReading: "Pour aller plus loin",
    sourcesFollowed: "Sources suivies",
  },
  en: {
    // Header
    siteTitle: "Daily Brief",
    siteSubtitle: "Your daily digest",
    skipToContent: "Skip to content",

    // Edition page
    stories: "stories",
    viewArchive: "View archive",
    curatedLinks: "curated links",
    readingTime: "Estimated reading time",
    minutes: "minutes",
    words: "words approximately",

    // Summary origins
    summaryOpenCode: "AI Summary",
    summaryFallback: "Automatic summary",

    // Archive page
    archiveTitle: "Edition Archives",
    archiveDescription: "All previous editions of the Daily Brief.",
    backToLatest: "← Latest edition",

    // Footer
    footerText: "Built with Markdown editions, OpenCode summaries, and Next.js.",

    // Date formatting
    locale: "en-GB",

    // Sections
    todayAtAGlance: "Today at a Glance",
    background: "Background",
    keyDates: "Key Dates",
    analysis: "Analysis",
    didYouKnow: "Did You Know?",
    furtherReading: "Further Reading",
    sourcesFollowed: "Sources Followed",
  },
} as const;

export function getLanguage(): Language {
  const lang = process.env.NEXT_PUBLIC_LANGUAGE || DEFAULT_LANGUAGE;
  return (lang === "fr" || lang === "en") ? lang : DEFAULT_LANGUAGE;
}

export function t(key: keyof typeof translations.fr): string {
  const lang = getLanguage();
  return translations[lang][key];
}

export function getLocale(): string {
  const lang = getLanguage();
  return translations[lang].locale;
}

export function getTimezone(): string {
  return process.env.NEXT_PUBLIC_TIMEZONE || "Europe/Paris";
}
