import path from "node:path";

export const ROOT_DIR = process.cwd();
export const CONTENT_DIR = path.resolve(ROOT_DIR, "content");
export const EDITIONS_DIR = path.resolve(CONTENT_DIR, "editions");
export const CACHE_DIR = path.resolve(CONTENT_DIR, "cache");
export const SEEN_CACHE_PATH = path.resolve(CACHE_DIR, "seen.json");
export const SUMMARY_METRICS_PATH = path.resolve(CACHE_DIR, "summary-metrics.json");
export const CONFIG_PATH = path.resolve(ROOT_DIR, "config.yml");
export const FEEDS_CONFIG_PATH = path.resolve(ROOT_DIR, "feeds.yml");
