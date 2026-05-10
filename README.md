# MoodleAgent

A local MCP (Model Context Protocol) server that scrapes your university's Moodle instance and exposes structured course data to any MCP-compatible LLM client — Claude Desktop, Cursor, Claude Code, and others.

Ask your AI assistant things like:
- *"What assignments do I have this week?"*
- *"Show me everything in the Algorithms course."*
- *"List all my enrolled courses."*

Everything runs on your machine. Credentials never leave your computer.

---

## How It Works

```
Claude Desktop / Cursor / Claude Code
        │  stdio transport
        ▼
mcp-server/          ← TypeScript MCP server (this repo)
        │
        ├── SQLite DB  (~/.moodle-mcp/db.sqlite)
        │     courses → sections → activities
        │
        └── Playwright (headless Chromium)
              │
              ▼
        University Moodle server
```

On first use (or when data is older than 24 hours), the server automatically logs into Moodle via a headless browser, scrapes your enrolled courses and their full section/activity structure, and caches everything locally in SQLite. Subsequent tool calls are instant — no scraping required.

---

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [npx playwright install chromium](https://playwright.dev/docs/intro) — downloads the headless browser

---

## Installation

```bash
git clone https://github.com/RoeeLanger/MoodleMCP.git
cd MoodleMCP/mcp-server

npm install
npx playwright install chromium

cp .env.example .env
# Edit .env and fill in your Moodle credentials
```

Then build:

```bash
npm run build
```

---

## Configuration

Edit `mcp-server/.env`:

```env
MOODLE_URL=https://moodle.bgu.ac.il/moodle/
MOODLE_USERNAME=your_username
MOODLE_PASSWORD=your_password
```

Alternatively, credentials can be passed as environment variables in your MCP client config (see below) — the `.env` file is optional if you do this.

---

## Wiring into Your MCP Client

### Claude Code (CLI)

```bash
claude mcp add moodle -s user \
  --env "MOODLE_URL=https://moodle.bgu.ac.il/moodle/" \
  --env "MOODLE_USERNAME=your_username" \
  --env "MOODLE_PASSWORD=your_password" \
  -- node "/path/to/MoodleMCP/mcp-server/dist/index.js"
```

> **Note:** The server name must come before the flags: `claude mcp add <name> [options] -- <command>`

### Claude Desktop

Add to `%APPDATA%\Claude\claude_desktop_config.json` (Windows) or `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS):

```json
{
  "mcpServers": {
    "moodle": {
      "command": "node",
      "args": ["/path/to/MoodleMCP/mcp-server/dist/index.js"],
      "env": {
        "MOODLE_URL": "https://moodle.bgu.ac.il/moodle/",
        "MOODLE_USERNAME": "your_username",
        "MOODLE_PASSWORD": "your_password"
      }
    }
  }
}
```

Restart Claude Desktop after saving.

### Cursor

Add the same block to Cursor's MCP settings under **Settings → MCP Servers**.

---

## Available Tools

| Tool | Description |
|---|---|
| `get_courses` | Lists all enrolled courses with IDs, names, and URLs |
| `get_course_content(course)` | Returns every section and activity inside a course — accepts a course ID or any part of the name |
| `get_assignments(course?)` | Returns all assignment-type activities across all courses, optionally filtered to one course |
| `force_refresh` | Bypasses the 24-hour cache and re-scrapes Moodle immediately |

The scraper runs automatically on first use or when cached data is older than 24 hours, so you rarely need to call `force_refresh` manually.

---

## Development

### Run the dump script

Scrapes Moodle and prints the full course/section/activity hierarchy to the terminal — useful for verifying the scraper is working correctly:

```bash
cd mcp-server
npm run build
node dist/dump.js
```

### Watch mode

```bash
npm run dev   # tsc --watch
```

### Data location

All scraped data and browser session state is stored in `~/.moodle-mcp/`:

```
~/.moodle-mcp/
├── db.sqlite            ← courses, sections, activities
└── storage_state.json   ← Playwright session cookies (auto-renewed on expiry)
```

---

## Project Structure

```
mcp-server/
├── package.json
├── tsconfig.json
├── .env.example
└── src/
    ├── index.ts      ← MCP server entry point + tool registration
    ├── db.ts         ← SQLite schema + typed query helpers
    ├── scraper.ts    ← Playwright login, course discovery, content scraping
    ├── config.ts     ← Env vars + data directory setup
    └── dump.ts       ← Dev script: scrape and print DB contents
```

---

## Roadmap

- [x] **Step 1+2** — Scraper + SQLite + 4 MCP tools
- [ ] **Step 3** — File downloader + PDF text extraction
- [ ] **Step 4** — PPTX and DOCX extraction
- [ ] **Step 5** — Full-text search across course materials (`search_materials` tool)
- [ ] **Step 6** — `npx` init CLI + npm packaging

---

## Security

- Credentials are stored only in your local `.env` file or MCP client config — never transmitted anywhere except to your university's Moodle server.
- The `.env` file and browser session (`storage_state.json`) are excluded from git via `.gitignore`.
- The SQLite database contains only scraped course metadata (names, URLs, activity types) — no file content in the current version.
