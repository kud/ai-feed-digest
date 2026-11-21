import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PUBLIC_EDITION_SCHEMA_VERSION,
  assignItemIds,
  findItemById,
  toPublicEdition
} from "../src/lib/edition-items";
import type { EditionItem, EditionSource } from "../src/lib/types";

function item(title: string, extra: Partial<EditionItem> = {}): EditionItem {
  return {
    title,
    url: `https://example.com/${encodeURIComponent(title)}`,
    publishedAt: "2026-11-12T08:00:00.000Z",
    summary: { abstract: `About ${title}`, bullets: [`${title} point`], via: "opencode", engine: "acme/model" },
    ...extra
  };
}

function ids(sources: EditionSource[]): Array<number | undefined> {
  return sources.flatMap((source) => source.items.map((entry) => entry.id));
}

test("assignItemIds numbers items from 1 in feed then article order", () => {
  const sources: EditionSource[] = [
    { feed: "Alpha", items: [item("a1"), item("a2")] },
    { feed: "Beta", items: [item("b1")] }
  ];
  assert.deepEqual(ids(assignItemIds(sources)), [1, 2, 3]);
});

test("assignItemIds does not mutate its input", () => {
  const sources: EditionSource[] = [{ feed: "Alpha", items: [item("a1")] }];
  assignItemIds(sources);
  assert.equal(sources[0].items[0].id, undefined);
});

test("assignItemIds keeps existing ids and fills gaps with free numbers", () => {
  const sources: EditionSource[] = [
    { feed: "Alpha", items: [item("a1", { id: 2 }), item("a2")] },
    { feed: "Beta", items: [item("b1", { id: 5 }), item("b2")] }
  ];
  assert.deepEqual(ids(assignItemIds(sources)), [2, 1, 5, 3]);
});

test("assignItemIds is idempotent", () => {
  const once = assignItemIds([{ feed: "Alpha", items: [item("a1"), item("a2")] }]);
  assert.deepEqual(assignItemIds(once), once);
});

test("assignItemIds replaces duplicate or invalid ids", () => {
  const sources: EditionSource[] = [
    { feed: "Alpha", items: [item("a1", { id: 1 }), item("a2", { id: 1 }), item("a3", { id: 0 })] }
  ];
  assert.deepEqual(ids(assignItemIds(sources)), [1, 2, 3]);
});

test("toPublicEdition flattens items with their source and drops generation details", () => {
  const edition = toPublicEdition({
    date: "2026-11-12",
    title: "Daily Brief — 12 Nov 2026",
    timezone: "Europe/Paris",
    generatedAt: "2026-11-12T08:31:00.000Z",
    sources: [
      { feed: "Alpha", items: [item("a1")] },
      { feed: "Beta", items: [item("b1")] }
    ]
  });

  assert.equal(edition.schemaVersion, PUBLIC_EDITION_SCHEMA_VERSION);
  assert.equal(edition.date, "2026-11-12");
  assert.equal(edition.generatedAt, "2026-11-12T08:31:00.000Z");
  assert.deepEqual(edition.items[1], {
    id: 2,
    title: "b1",
    source: "Beta",
    url: "https://example.com/b1",
    publishedAt: "2026-11-12T08:00:00.000Z",
    summary: { abstract: "About b1", bullets: ["b1 point"] }
  });
  assert.equal(JSON.stringify(edition).includes("acme/model"), false);
});

test("toPublicEdition lists items by id and reports a missing generatedAt as null", () => {
  const edition = toPublicEdition({
    date: "2026-11-12",
    title: "t",
    timezone: "UTC",
    sources: [{ feed: "Alpha", items: [item("a1", { id: 3 }), item("a2", { id: 1 })] }]
  });
  assert.deepEqual(edition.items.map((entry) => entry.id), [1, 3]);
  assert.equal(edition.generatedAt, null);
});

test("findItemById resolves an id and returns null for an unknown one", () => {
  const edition = toPublicEdition({
    date: "2026-11-12",
    title: "t",
    timezone: "UTC",
    sources: [{ feed: "Alpha", items: [item("a1"), item("a2")] }]
  });
  assert.equal(findItemById(edition, 2)?.title, "a2");
  assert.equal(findItemById(edition, 12), null);
});
