# AI Feed Digest

An AI-powered RSS feed aggregator that generates elegant daily briefings in your language of choice.

## Features

- **AI-Powered Summaries** - Automatically generates concise summaries of articles using OpenAI-compatible models
- **Multi-Language Support** - Configure your preferred language for all AI-generated content
- **Smart Feed Management** - Tracks seen articles to avoid duplicates across editions
- **Beautiful Web Interface** - Browse your daily digests and archives with a clean, responsive design
- **Configurable Digest Schedule** - Set your preferred time and reading duration
- **Markdown-Based** - All editions stored as markdown files for easy archiving and portability

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
  target_reading_minutes: 45
opencode:
  model: "github-copilot/gpt-4.1"
  agent: null
  timeout_ms: 45000
```

4. Add your RSS feeds in `feeds.yml`:

```yaml
feeds:
  - title: "BBC World"
    url: "http://feeds.bbci.co.uk/news/world/rss.xml"
  - title: "Hacker News"
    url: "https://hnrss.org/frontpage"
```

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
- `digest.target_reading_minutes` - Target reading time for the entire digest

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
