import fs from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { z } from "zod";
import { EDITIONS_DIR } from "./constants";
import type { EditionDocument, EditionFrontmatter } from "./types";

const editionSchema = z.object({
  date: z
    .union([z.string(), z.date()])
    .transform((value) => (value instanceof Date ? value.toISOString().slice(0, 10) : value))
    .refine((value) => /^\d{4}-\d{2}-\d{2}$/.test(value), {
      message: "date must be YYYY-MM-DD"
    }),
  title: z.string(),
  timezone: z.string(),
  sources: z
    .array(
      z.object({
        feed: z.string(),
        items: z
          .array(
            z.object({
              title: z.string(),
              url: z.string().url(),
              publishedAt: z
                .union([z.string(), z.date()])
                .transform((value) => (value instanceof Date ? value.toISOString() : value)),
              summary: z
                .object({
                  abstract: z.string(),
                  bullets: z.array(z.string()).min(1).max(5),
                  via: z.enum(["opencode", "fallback"]).optional(),
                  engine: z.string().nullable().optional()
                })
                .passthrough()
            })
          )
          .min(1)
      })
    )
    .min(1),
  generatedAt: z.string().optional(),
  readingMinutes: z.number().optional(),
  wordCount: z.number().optional(),
  targetReadingMinutes: z.number().optional()
});

export async function listEditionSlugs(): Promise<string[]> {
  const entries = await fs.readdir(EDITIONS_DIR, { withFileTypes: true });
  const slugs = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name.replace(/\.md$/, ""))
    .filter((slug) => /^\d{4}-\d{2}-\d{2}$/.test(slug))
    .sort()
    .reverse();
  return slugs;
}

export async function loadEditionByDate(date: string): Promise<EditionDocument | null> {
  const target = path.resolve(EDITIONS_DIR, `${date}.md`);
  try {
    const file = await fs.readFile(target, "utf8");
    return parseEdition(file, date);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function loadMostRecentEdition(): Promise<EditionDocument | null> {
  const slugs = await listEditionSlugs();
  if (slugs.length === 0) {
    return null;
  }
  return loadEditionByDate(slugs[0]);
}

function parseEdition(fileContents: string, slug: string): EditionDocument {
  const parsed = matter(fileContents);
  const validated = editionSchema.parse(parsed.data) as EditionFrontmatter;
  return {
    ...validated,
    slug,
    content: parsed.content.trim()
  };
}
