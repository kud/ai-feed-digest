#!/usr/bin/env tsx

/**
 * Validation script for config.yml and feeds.yml files
 * 
 * Usage:
 *   npx tsx scripts/validate-config.ts
 * 
 * Validates:
 * - Required fields and structure
 * - Data types and constraints
 * - V4 target_words configuration
 */

import { readFileSync, existsSync } from "node:fs";
import { parse } from "yaml";
import { resolve } from "node:path";

interface ValidationError {
  file: string;
  field: string;
  message: string;
}

interface Config {
  timezone: string;
  language: string;
  digest: {
    hour: number;
    minute: number;
    max_articles_per_feed: number;
    max_chars_per_summary: number;
    min_chars_per_summary: number;
    target_words: {
      synthesis: number;
      analysis: number;
      key_points?: number; // preferred
      watch_points?: number; // preferred
      keyPoints?: number; // legacy
      watchPoints?: number; // legacy
      curiosities: number;
      positives: number;
    };
  };
  opencode: {
    model: string;
    agent: string | null;
  };
  timeout_ms: number;
  thematic_order: boolean;
}

interface Feed {
  title: string;
  url: string;
  tags?: string[];
}

interface Feeds {
  feeds: Feed[];
}

const errors: ValidationError[] = [];

function addError(file: string, field: string, message: string): void {
  errors.push({ file, field, message });
}

function validateConfig(configPath: string): void {
  if (!existsSync(configPath)) {
    addError(configPath, "file", "Config file does not exist");
    return;
  }

  let config: any;
  try {
    const content = readFileSync(configPath, "utf-8");
    config = parse(content);
  } catch (err) {
    addError(configPath, "file", `Failed to parse YAML: ${err}`);
    return;
  }

  // Validate timezone
  if (!config.timezone || typeof config.timezone !== "string") {
    addError(configPath, "timezone", "Required string field missing or invalid");
  }

  // Validate language
  if (!config.language || typeof config.language !== "string") {
    addError(configPath, "language", "Required string field missing or invalid");
  }

  // Validate digest section
  if (!config.digest || typeof config.digest !== "object") {
    addError(configPath, "digest", "Required object missing");
    return;
  }

  // Validate digest.hour
  if (typeof config.digest.hour !== "number" || config.digest.hour < 0 || config.digest.hour > 23) {
    addError(configPath, "digest.hour", "Must be a number between 0 and 23");
  }

  // Validate digest.minute
  if (typeof config.digest.minute !== "number" || config.digest.minute < 0 || config.digest.minute > 59) {
    addError(configPath, "digest.minute", "Must be a number between 0 and 59");
  }

  // Validate digest.max_articles_per_feed
  if (typeof config.digest.max_articles_per_feed !== "number" || config.digest.max_articles_per_feed < 1) {
    addError(configPath, "digest.max_articles_per_feed", "Must be a positive number");
  }

  // Validate digest.max_chars_per_summary
  if (typeof config.digest.max_chars_per_summary !== "number" || config.digest.max_chars_per_summary < 1) {
    addError(configPath, "digest.max_chars_per_summary", "Must be a positive number");
  }

  // Validate digest.min_chars_per_summary
  if (typeof config.digest.min_chars_per_summary !== "number" || config.digest.min_chars_per_summary < 1) {
    addError(configPath, "digest.min_chars_per_summary", "Must be a positive number");
  }

  // Validate min < max
  if (config.digest.min_chars_per_summary >= config.digest.max_chars_per_summary) {
    addError(configPath, "digest.min_chars_per_summary", "Must be less than max_chars_per_summary");
  }

  // Validate V4 target_words (all 6 sections required)
  if (!config.digest.target_words || typeof config.digest.target_words !== "object") {
    addError(configPath, "digest.target_words", "Required object missing");
  } else {
    // Support legacy camelCase (keyPoints, watchPoints) while preferring snake_case
    const tw = config.digest.target_words;

    // If legacy keys present but snake_case missing, copy values and warn
    const hadLegacy = (tw.keyPoints !== undefined || tw.watchPoints !== undefined);
    if (tw.keyPoints !== undefined && tw.key_points === undefined) {
      tw.key_points = tw.keyPoints;
    }
    if (tw.watchPoints !== undefined && tw.watch_points === undefined) {
      tw.watch_points = tw.watchPoints;
    }
    if (hadLegacy && process.env.NODE_ENV !== "production") {
      console.warn("[config] target_words.keyPoints/watchPoints are deprecated; use key_points/watch_points");
    }

    const requiredSections = ["synthesis", "analysis", "key_points", "watch_points", "curiosities", "positives"];
    for (const section of requiredSections) {
      const value = tw[section];
      if (typeof value !== "number" || value < 1) {
        addError(configPath, `digest.target_words.${section}`, "Must be a positive number");
      }
    }
  }

  // Validate opencode section
  if (!config.opencode || typeof config.opencode !== "object") {
    addError(configPath, "opencode", "Required object missing");
  } else {
    if (!config.opencode.model || typeof config.opencode.model !== "string") {
      addError(configPath, "opencode.model", "Required string field missing or invalid");
    }
    // agent can be null or string
    if (config.opencode.agent !== null && typeof config.opencode.agent !== "string") {
      addError(configPath, "opencode.agent", "Must be null or string");
    }
  }

  // Validate timeout_ms
  if (typeof config.timeout_ms !== "number" || config.timeout_ms < 1000) {
    addError(configPath, "timeout_ms", "Must be a number >= 1000");
  }

  // Validate thematic_order
  if (typeof config.thematic_order !== "boolean") {
    addError(configPath, "thematic_order", "Must be a boolean");
  }
}

function validateFeeds(feedsPath: string): void {
  if (!existsSync(feedsPath)) {
    addError(feedsPath, "file", "Feeds file does not exist");
    return;
  }

  let feeds: any;
  try {
    const content = readFileSync(feedsPath, "utf-8");
    feeds = parse(content);
  } catch (err) {
    addError(feedsPath, "file", `Failed to parse YAML: ${err}`);
    return;
  }

  // Validate feeds array
  if (!feeds.feeds || !Array.isArray(feeds.feeds)) {
    addError(feedsPath, "feeds", "Required array missing");
    return;
  }

  if (feeds.feeds.length === 0) {
    addError(feedsPath, "feeds", "Must contain at least one feed");
  }

  // Validate each feed
  feeds.feeds.forEach((feed: any, index: number) => {
    const prefix = `feeds[${index}]`;

    if (!feed.title || typeof feed.title !== "string") {
      addError(feedsPath, `${prefix}.title`, "Required string field missing or invalid");
    }

    if (!feed.url || typeof feed.url !== "string") {
      addError(feedsPath, `${prefix}.url`, "Required string field missing or invalid");
    } else {
      // Basic URL validation
      try {
        new URL(feed.url);
      } catch {
        addError(feedsPath, `${prefix}.url`, "Invalid URL format");
      }
    }

    // Tags are optional but must be array of strings if present
    if (feed.tags !== undefined) {
      if (!Array.isArray(feed.tags)) {
        addError(feedsPath, `${prefix}.tags`, "Must be an array");
      } else {
        feed.tags.forEach((tag: any, tagIndex: number) => {
          if (typeof tag !== "string") {
            addError(feedsPath, `${prefix}.tags[${tagIndex}]`, "Must be a string");
          }
        });
      }
    }
  });
}

function main(): void {
  console.log("🔍 Validating configuration files...\n");

  const configPath = resolve(process.cwd(), "config.yml");
  const feedsPath = resolve(process.cwd(), "feeds.yml");

  validateConfig(configPath);
  validateFeeds(feedsPath);

  if (errors.length === 0) {
    console.log("✅ All configuration files are valid!\n");
    process.exit(0);
  } else {
    console.error("❌ Validation errors found:\n");
    errors.forEach((error) => {
      console.error(`  ${error.file}`);
      console.error(`    Field: ${error.field}`);
      console.error(`    Error: ${error.message}\n`);
    });
    process.exit(1);
  }
}

main();
