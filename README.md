# AI Feed Digest

<p align="left">
  <a href="#"><img alt="Project Status" src="https://img.shields.io/badge/status-experimental-purple" /></a>
  <a href="#"><img alt="Version" src="https://img.shields.io/badge/version-0.1.0-blue" /></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-MIT-green" /></a>
  <a href="https://nodejs.org/en"><img alt="Node.js" src="https://img.shields.io/badge/node-%3E=18-43853d?logo=node.js&logoColor=white" /></a>
  <a href="https://nextjs.org"><img alt="Next.js" src="https://img.shields.io/badge/Next.js-15-black?logo=next.js" /></a>
  <a href="https://www.typescriptlang.org/"><img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white" /></a>
  <a href="#"><img alt="AI" src="https://img.shields.io/badge/AI-OpenAI%20Compatible-ff6b00" /></a>
  <a href="https://github.com/kud/ai-feed-digest/pulls"><img alt="PRs Welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" /></a>
  <a href="#"><img alt="Maintenance" src="https://img.shields.io/badge/maintained-yes-success" /></a>
</p>

An AI-powered RSS feed aggregator that generates **premium, magazine-quality daily briefings** in your language of choice. Version 6 delivers sophisticated, long-form analytical journalism comparable to The Economist or The Atlantic.

## Features

- **📰 Magazine-Quality Briefings** - Sophisticated, essay-style analysis that reads like premium journalism (4,000-5,000 words)
- **🧠 Deep Intellectual Engagement** - Non-obvious insights, cross-domain connections, and strategic foresight
- **🎯 AI-Powered Synthesis** - Transforms dozens of articles into coherent narratives using OpenAI-compatible models
- **🌍 Multi-Language Support** - Configure your preferred language for all AI-generated content
- **📊 Smart Feed Management** - Tracks seen articles to avoid duplicates across editions
- **💎 Beautiful Web Interface** - Browse your daily digests and archives with a clean, responsive design
- **⏰ Configurable Schedule** - Set your preferred time and reading duration
- **📝 Markdown-Based** - All editions stored as markdown files for easy archiving and portability

### What Makes v6 Special

Version 6 elevates the digest from a news summary to **premium analytical journalism**:

- **Narrative craft**: Stories with hooks, arcs, and elegant transitions
- **Deep analysis**: 7-10 paragraph investigations revealing hidden mechanisms
- **Strategic insights**: Non-obvious takeaways impossible to get elsewhere  
- **Thought-provoking angles**: Paradoxes, questions, and perspective shifts
- **12-15 minute read**: Substantial enough to be genuinely informative and engaging

Each edition markdown now includes additional frontmatter fields for richer UI (replaces the old inline reading time line):
- `generatedAt` (ISO timestamp of build)
- `readingMinutes` (estimated whole minutes for briefing sections)
- `wordCount` (word count of briefing sections)

## Quick Start

### Prerequisites

- Node.js 18+
- An OpenAI-compatible API (OpenCode, OpenAI, etc.)

### Installation

```bash
npm install
```

### Configuration

1. Copy the example configuration files:

```bash
cp config.example.yml config.yml
cp feeds.example.yml feeds.yml
```

2. Set up your environment:

```bash
cp .env.example .env.local
```

Add your OpenCode credentials to `.env.local`:

```env
OPENCODE_API_KEY=your_key_here
OPENCODE_BASE_URL=https://api.opencode.ai
```

3. Configure your digest settings in `config.yml`:

```yaml
timezone: "Europe/Paris"
language: "French"  # Or "English", "Spanish", "Canadian French", etc.
digest:
  hour: 18
  minute: 0
  max_articles_per_feed: 8
  max_chars_per_summary: 400
  min_chars_per_summary: 140
  target_words:
    synthesis: 1800      # Opening essay establishing narrative arc
    analysis: 1200       # Deep investigation revealing mechanisms
    key_points: 500      # Crystallized strategic insights
    watch_points: 400    # Forward-looking early warnings
    curiosities: 350     # Perspective-shifting explorations
    positives: 350       # Constructive progress narratives
opencode:
  model: "github-copilot/gpt-4.1"
  agent: null
timeout_ms: 45000

thematic_order: false  # Set to true to group articles by theme
```

Migration note: legacy keys `keyPoints` and `watchPoints` are still accepted for backward compatibility but will emit a deprecation warning in non-production environments. Update your `config.yml` to use `key_points` and `watch_points` instead.
4. Add your RSS feeds in `feeds.yml`:

```yaml
feeds:
  - title: "BBC World"
    url: "http://feeds.bbci.co.uk/news/world/rss.xml"
    tags: [news]
  - title: "Hacker News"
    url: "https://hnrss.org/frontpage"
    tags: [tech, coding]
```

Optional: add `tags` arrays (free-form lowercase strings) to influence narrative ordering when thematic ordering is enabled.

### Generate Your First Edition

```bash
npm run generate:edition
```

This will:
- Fetch articles from your configured feeds
- Generate AI summaries in your chosen language
- Create a markdown file in `content/editions/`

### View Your Digests

Start the development server:

```bash
npm run dev
```

Visit `http://localhost:3000` to view your digests.

## Configuration Options

### Digest Settings

- `timezone` - Your local timezone (e.g., "Europe/Paris", "America/New_York")
- `language` - Language for AI-generated content (full name: "French", "English", etc.)
- `digest.hour` - Hour to generate digest (0-23)
- `digest.minute` - Minute to generate digest (0-59)
- `digest.max_articles_per_feed` - Maximum articles to include per feed
- `digest.max_chars_per_summary` - Maximum length of article summaries
- `digest.min_chars_per_summary` - Minimum length of article summaries
- `digest.target_words.synthesis` - Target word count for synthesis section (~1800 words - your opening essay)
- `digest.target_words.analysis` - Target word count for analysis section (~1200 words - deep investigation)
- `digest.target_words.key_points` - Target word count for key points section (~500 words - strategic insights)
- `digest.target_words.watch_points` - Target word count for watch points section (~400 words - horizon scan)
- `digest.target_words.curiosities` - Target word count for curiosities section (~350 words - thought experiments)
- `digest.target_words.positives` - Target word count for positives section (~350 words - progress report)

### OpenCode Settings

- `opencode.model` - AI model to use (e.g., "github-copilot/gpt-4.1")
- `opencode.agent` - Optional agent configuration
- `opencode.timeout_ms` - Request timeout in milliseconds

## Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run generate:edition` - Generate a new digest (with progress indicators)
- `npm run generate:edition:raw` - Generate a new digest (raw output)

## Project Structure

```
rss-digest/
├── content/
│   ├── cache/
│   │   └── seen.json          # Tracks processed articles
│   └── editions/              # Generated digest files
│       └── YYYY-MM-DD.md
├── src/
│   ├── app/                   # Next.js pages
│   ├── components/            # React components
│   ├── lib/                   # Utility functions and types
│   └── oc-client.ts          # OpenCode API client
├── scripts/
│   ├── build-edition.ts       # Main digest generation script
│   └── generate-with-opencode.sh  # Wrapper script with UI
├── config.yml                 # Main configuration
├── feeds.yml                  # RSS feed sources
└── .env.local                # API credentials
```

## How It Works

1. **Fetch** - Retrieves latest articles from configured RSS feeds
2. **Filter** - Checks against seen cache to avoid duplicates
3. **Summarize** - Uses AI to generate concise, language-appropriate summaries
4. **Generate** - Creates markdown files with metadata and content
5. **Display** - Next.js app renders editions with beautiful formatting

## Environment Variables

The following optional environment variables allow tuning performance and output.

- `FEED_CONCURRENCY` (default 6): Parallel RSS feed fetches.
- `HYDRATE_CONCURRENCY` (default 6): Concurrent article content hydration (network bound).
- `HYDRATE_PER_DOMAIN_CONCURRENCY` (default 1, max 3): Limits simultaneous hydration requests hitting the same domain (courtesy + rate-limit avoidance).
- `SUMMARY_CONCURRENCY` (default 3): Parallel AI summary generations (CPU/network/billing bound).
- `SUMMARY_RETRIES` (default 3, max 5): Exponential backoff retry attempts for failed or unparseable AI responses.
- `READING_WPM` (default 210): Words-per-minute used to estimate reading time; validated range 80–500.
- `INCLUDE_SOURCE_URL_IN_PROMPT` (default true): Set to `false` to omit the original URL from the model prompt (for minimal disclosure environments).
- `OPENCODE_MODEL`: One-off override of `opencode.model` for a single run. Example: `OPENCODE_MODEL=openai/gpt-4o-mini npm run generate:edition`. Does not change `config.yml`.

Retry strategy: failed / unparseable summary responses are retried with exponential backoff (500ms, 1s, 2s, 4s…). After exhausting attempts a deterministic fallback summary is emitted so the edition always completes.

Deterministic ordering: even with concurrency, summaries are written in the original feed + article order to keep editions stable across runs.

### Summary Generation Metrics

After running `npm run generate:edition`, the script prints a compact metrics line summarising AI summary outcomes, for example:

```
ℹ summary-metrics success=22 success_after_retry=4 parse_fail=1 request_error=0 refusal_fallback=1
```

Metric keys:
- `success`: Summaries parsed successfully on any attempt.
- `success_after_retry`: Subset of successes that required >1 attempt (quality / latency signal).
- `parse_fail`: Model responded but output could not be parsed into abstract + 3 bullets.
- `request_error`: Transport / timeout errors (before parsing).
- `refusal_fallback`: Final fallback summaries produced after apparent model refusal messages.
- `exhausted_fallback`: Fallbacks after non-refusal repeated failures (e.g. persistent parse issues).

Use these to tune `SUMMARY_CONCURRENCY`, `SUMMARY_RETRIES`, model choice, or prompt settings. High `parse_fail` suggests prompt or model drift; elevated `request_error` suggests network or timeout tuning; frequent `refusal_fallback` may merit adjusting content hints or including the source URL (`INCLUDE_SOURCE_URL_IN_PROMPT=true`).

## Deployment

Build the application:

```bash
npm run build
```

The static site can be deployed to any hosting platform that supports Next.js (Vercel, Netlify, etc.).

## License

MIT

## Contributing

Contributions welcome! Please open an issue or submit a pull request.
