import type { EditionDocument, EditionItem, EditionSource } from "./types";

/**
 * Version of the public JSON edition format. Bump it whenever a field is
 * renamed or removed so that readers can detect an incompatible edition.
 */
export const PUBLIC_EDITION_SCHEMA_VERSION = 1;

export interface PublicEditionItem {
  id: number;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  summary: {
    abstract: string;
    bullets: string[];
  };
}

export interface PublicEdition {
  schemaVersion: number;
  date: string;
  title: string;
  timezone: string;
  generatedAt: string | null;
  items: PublicEditionItem[];
}

/**
 * Gives every item of an edition a stable numeric id, counted from 1 in
 * reading order (feed order, then article order within a feed).
 *
 * Items that already carry a valid id keep it, so ids written into an
 * edition file never move. Items without one get the next free number,
 * which makes older editions (written before ids existed) addressable too.
 */
export function assignItemIds(sources: EditionSource[]): EditionSource[] {
  const taken = new Set<number>();
  for (const source of sources) {
    for (const item of source.items) {
      if (isValidId(item.id) && !taken.has(item.id)) {
        taken.add(item.id);
      }
    }
  }

  const kept = new Set<number>();
  let next = 1;
  const nextFree = (): number => {
    while (taken.has(next)) next++;
    taken.add(next);
    return next;
  };

  return sources.map((source) => ({
    ...source,
    items: source.items.map((item): EditionItem => {
      if (isValidId(item.id) && !kept.has(item.id)) {
        kept.add(item.id);
        return item;
      }
      return { ...item, id: nextFree() };
    })
  }));
}

/**
 * Flattens an edition into the public handoff format shared by the web
 * reader and conversational readers. Only public RSS data is kept: the
 * summary's generation details (`via`, `engine`) are left out.
 */
export function toPublicEdition(
  edition: Pick<EditionDocument, "date" | "title" | "timezone" | "generatedAt" | "sources">
): PublicEdition {
  const items: PublicEditionItem[] = [];
  for (const source of assignItemIds(edition.sources)) {
    for (const item of source.items) {
      items.push({
        id: item.id as number,
        title: item.title,
        source: source.feed,
        url: item.url,
        publishedAt: item.publishedAt,
        summary: {
          abstract: item.summary.abstract,
          bullets: [...item.summary.bullets]
        }
      });
    }
  }
  items.sort((a, b) => a.id - b.id);

  return {
    schemaVersion: PUBLIC_EDITION_SCHEMA_VERSION,
    date: edition.date,
    title: edition.title,
    timezone: edition.timezone,
    generatedAt: edition.generatedAt ?? null,
    items
  };
}

/** Looks an item up by its id, as in "dig into 12". */
export function findItemById(edition: PublicEdition, id: number): PublicEditionItem | null {
  return edition.items.find((item) => item.id === id) ?? null;
}

function isValidId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0;
}
