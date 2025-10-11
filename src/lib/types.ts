export interface ItemSummary {
  abstract: string;
  bullets: string[];
  via?: "opencode" | "fallback";
  engine?: string | null;
}

export interface EditionItem {
  title: string;
  url: string;
  publishedAt: string;
  summary: ItemSummary;
}

export interface EditionSource {
  feed: string;
  items: EditionItem[];
}

export interface EditionFrontmatter {
  date: string;
  title: string;
  timezone: string;
  sources: EditionSource[];
  generatedAt?: string;
}

export interface EditionDocument extends EditionFrontmatter {
  slug: string;
  content: string;
}

export interface EditionNarrativeItem {
  feed: string;
  title: string;
  url: string;
  publishedAt: string;
  summary: ItemSummary;
}

export interface EditionBriefing {
  overview: string;
  background: string;
  analysis: string;
  timeline: Array<{
    title: string;
    summary: string;
    date: string;
    source: string;
    url: string;
  }>;
  fastFacts: string[];
  furtherReading: Array<{
    title: string;
    url: string;
    note?: string;
  }>;
  readingMinutes: number;
  wordCount: number;
}

export interface DigestConfig {
  timezone: string;
  language: string;
  digest: {
    hour: number;
    minute: number;
    max_articles_per_feed: number;
    max_chars_per_summary: number;
    min_chars_per_summary: number;
    target_reading_minutes: number;
  };
  opencode: {
    model: string;
    agent: string | null;
    timeout_ms: number;
  };
  feeds: Array<{
    title: string;
    url: string;
  }>;
}

export interface SummariseInput {
  title: string;
  url: string;
  text: string;
  maxChars: number;
  minChars: number;
}

export interface SummariseResult {
  abstract: string;
  bullets: string[];
  via: "opencode" | "fallback";
  engine?: string | null;
}
