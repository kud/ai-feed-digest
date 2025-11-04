#!/usr/bin/env tsx
/**
 * Post-generation quality validation script for daily briefing editions.
 * Checks word count, section presence, and content quality metrics.
 * 
 * Usage: tsx scripts/validate-briefing-quality.ts [YYYY-MM-DD]
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import YAML from "yaml";
import { EDITIONS_DIR } from "../src/lib/constants";

interface ValidationResult {
  ok: boolean;
  warnings: string[];
  errors: string[];
  metrics: {
    totalWords: number;
    sectionWords: Record<string, number>;
    missingRequiredSections: string[];
    sectionParagraphs: Record<string, number>;
  };
}

const REQUIRED_SECTIONS = [
  "L'essentiel du jour",
  "Analyse",
  "Points clés",
  "Points de vigilance",
  "Curiosités",
  "Points positifs"
];

const MINIMUM_WORD_COUNTS = {
  synthesis: 1400,
  analysis: 900,
  key_points: 400,
  watch_points: 300,
  curiosities: 250,
  positives: 250
};

const MINIMUM_TOTAL_WORDS = 2600;

async function validateEdition(date: string): Promise<ValidationResult> {
  const editionPath = path.join(EDITIONS_DIR, `${date}.md`);
  const warnings: string[] = [];
  const errors: string[] = [];
  
  let content: string;
  try {
    content = await fs.readFile(editionPath, "utf8");
  } catch (error) {
    errors.push(`Edition file not found: ${editionPath}`);
    return {
      ok: false,
      warnings,
      errors,
      metrics: {
        totalWords: 0,
        sectionWords: {},
        missingRequiredSections: [],
        sectionParagraphs: {}
      }
    };
  }

  // Parse frontmatter
  const frontmatterMatch = content.match(/^---\n([\s\S]+?)\n---/);
  if (!frontmatterMatch) {
    errors.push("Missing or malformed frontmatter");
  }

  // Extract main content
  const mainContent = content.replace(/^---\n[\s\S]+?\n---\n/, "");
  
  // Check for required sections
  const missingRequiredSections: string[] = [];
  for (const section of REQUIRED_SECTIONS) {
    const regex = new RegExp(`^#+ ${section}`, "m");
    if (!regex.test(mainContent)) {
      missingRequiredSections.push(section);
      errors.push(`Missing required section: ${section}`);
    }
  }

  // Extract sections and count words
  const sectionWords: Record<string, number> = {};
  const sectionParagraphs: Record<string, number> = {};
  
  const sectionMapping = {
    "L'essentiel du jour": "synthesis",
    "Analyse": "analysis",
    "Points clés": "key_points",
    "Points de vigilance": "watch_points",
    "Curiosités": "curiosities",
    "Points positifs": "positives"
  };

  for (const [title, key] of Object.entries(sectionMapping)) {
    // Match section from its heading to the next heading
    const escapedTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`^#+ ${escapedTitle}\\n([\\s\\S]+?)(?=\\n#|$)`, "m");
    const match = mainContent.match(regex);
    
    if (match) {
      const sectionContent = match[1].trim();
      const words = sectionContent.split(/\s+/).filter(Boolean);
      sectionWords[key] = words.length;
      
      // Count paragraphs (blocks separated by blank lines)
      const paragraphs = sectionContent.split(/\n\s*\n/).filter(p => p.trim().length > 0);
      sectionParagraphs[key] = paragraphs.length;
      
      // Check against minimum
      const minimum = MINIMUM_WORD_COUNTS[key as keyof typeof MINIMUM_WORD_COUNTS];
      if (words.length < minimum * 0.85) {
        warnings.push(
          `Section "${title}" below 85% of target (${words.length}/${minimum} words)`
        );
      }
    }
  }

  const totalWords = Object.values(sectionWords).reduce((sum, count) => sum + count, 0);
  
  if (totalWords < MINIMUM_TOTAL_WORDS * 0.85) {
    errors.push(
      `Total word count below 85% of minimum (${totalWords}/${MINIMUM_TOTAL_WORDS})`
    );
  } else if (totalWords < MINIMUM_TOTAL_WORDS) {
    warnings.push(
      `Total word count slightly below target (${totalWords}/${MINIMUM_TOTAL_WORDS})`
    );
  }

  // Check for English fragments (simple heuristic)
  const englishWords = ["the", "and", "with", "from", "have", "will", "would", "could"];
  const englishPattern = new RegExp(`\\b(${englishWords.join("|")})\\b`, "gi");
  const englishMatches = mainContent.match(englishPattern) || [];
  const totalWordsInContent = mainContent.split(/\s+/).filter(Boolean).length;
  const englishRatio = englishMatches.length / totalWordsInContent;
  
  if (englishRatio > 0.02) {
    warnings.push(
      `Potential English content detected (~${(englishRatio * 100).toFixed(1)}% English stopwords)`
    );
  }

  // Check for minimal content in sections
  const minParagraphs: Record<string, number> = {
    synthesis: 5,
    analysis: 6,
    key_points: 4,
    watch_points: 3,
    curiosities: 3,
    positives: 3
  };

  for (const [key, minCount] of Object.entries(minParagraphs)) {
    const count = sectionParagraphs[key] || 0;
    if (count < minCount) {
      warnings.push(
        `Section "${key}" has fewer paragraphs than recommended (${count}/${minCount})`
      );
    }
  }

  const ok = errors.length === 0 && warnings.length === 0;

  return {
    ok,
    warnings,
    errors,
    metrics: {
      totalWords,
      sectionWords,
      missingRequiredSections,
      sectionParagraphs
    }
  };
}

async function main() {
  const arg = process.argv[2];
  const date = arg || new Date().toISOString().slice(0, 10);

  console.log(`\n📋 Validating briefing for ${date}...\n`);

  const result = await validateEdition(date);

  console.log("Metrics:");
  console.log(`  Total words: ${result.metrics.totalWords}`);
  console.log(`  Section word counts:`);
  for (const [section, count] of Object.entries(result.metrics.sectionWords)) {
    const min = MINIMUM_WORD_COUNTS[section as keyof typeof MINIMUM_WORD_COUNTS];
    const status = count >= min ? "✓" : count >= min * 0.85 ? "⚠" : "✗";
    console.log(`    ${status} ${section}: ${count}/${min}`);
  }
  console.log(`  Section paragraphs:`);
  for (const [section, count] of Object.entries(result.metrics.sectionParagraphs)) {
    console.log(`    • ${section}: ${count}`);
  }

  if (result.errors.length > 0) {
    console.log("\n❌ Errors:");
    for (const error of result.errors) {
      console.log(`  • ${error}`);
    }
  }

  if (result.warnings.length > 0) {
    console.log("\n⚠️  Warnings:");
    for (const warning of result.warnings) {
      console.log(`  • ${warning}`);
    }
  }

  if (result.ok) {
    console.log("\n✅ Validation passed!\n");
    process.exit(0);
  } else {
    console.log(
      `\n${result.errors.length > 0 ? "❌" : "⚠️"} Validation completed with ${result.errors.length} error(s) and ${result.warnings.length} warning(s)\n`
    );
    process.exit(result.errors.length > 0 ? 1 : 0);
  }
}

void main();
