# MoodleAgent — Project Guide

## What This Is

A local MCP (Model Context Protocol) server that scrapes a student's Moodle instance and exposes course data to any MCP-compatible LLM client (Claude Desktop, Cursor, etc.) via structured tools.

Runs entirely on the student's machine — no central hosting, no credential exposure.

---

## Architecture

```
Claude Desktop / Cursor / any MCP client
        │  stdio transport
        ▼
mcp-server/          ← TypeScript, npm package
        │
        ▼
~/.moodle-mcp/
  ├── db.sqlite            ← courses, assignments, events (SQLite + FTS5)
  ├── storage_state.json   ← Playwright session cookies
  └── files/               ← downloaded course files (Step 3+)
        │
        │ Playwright (headless Chromium)
        ▼
  University's Moodle server
```

**Staleness rule:** every tool call checks `last_scraped` in the courses table.
If missing or older than 24 h, the scraper runs automatically before returning data.

---

## Stack

| Layer | Technology |
|---|---|
| MCP server | `@modelcontextprotocol/sdk` (TypeScript, stdio) |
| Scraper | `playwright` (headless Chromium) |
| Database | `better-sqlite3` (SQLite WAL) |
| PDF extraction | `pdf-parse` (Step 3) |
| DOCX/PPTX | `mammoth` / `officeparser` (Step 4) |
| Auth / config | `dotenv` + `.env` or MCP client `env` block |

---

## MCP Tools (current — Steps 1+2)

| Tool | Description |
|---|---|
| `get_courses()` | Lists all enrolled courses with IDs and URLs |
| `get_assignments(course_id?, days?)` | Assignments from DB, with ISO due dates |
| `get_events(days?)` | Calendar events (includes assignment deadlines) |
| `force_refresh()` | Bypass 24 h cache and re-scrape immediately |

---

## Scraper Pipeline (Steps 1–2)

1. Load Playwright session from `~/.moodle-mcp/storage_state.json`; re-login if expired
2. Dashboard (`/my/`) → enumerate enrolled courses → upsert `courses` table
3. Calendar upcoming (`/calendar/view.php?view=upcoming`) → upsert `events` table;
   events linking to `mod/assign` are also written to `assignments` table

---

## Build Order

```
Step 1+2 ✓  Scraper + SQLite + 4 MCP tools
Step 3      File downloader + PDF text extraction
Step 4      PPTX + DOCX extraction
Step 5      SQLite FTS5 search_materials tool
Step 6      npx init CLI + npm packaging
```

---

## Repo Layout

```
mcp-server/
├── package.json
├── tsconfig.json
├── .env.example        ← copy to .env and fill in credentials
└── src/
    ├── index.ts        ← MCP server entry point + tool registration
    ├── db.ts           ← SQLite schema + typed query helpers
    ├── scraper.ts      ← Playwright login / courses / calendar
    ├── config.ts       ← env vars + ~/.moodle-mcp/ paths
    └── dump.ts         ← dev script: scrape and print DB contents
```

---

## Repo Conventions

- `mcp-server/.env` holds credentials — never commit, keep `.env.example`
- `~/.moodle-mcp/storage_state.json` holds the browser session — never commit
- Both are in `.gitignore`
- All logging uses `console.error` (stdout is reserved for the MCP stdio protocol)

---

## Wiring into Claude Desktop

Add to `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "moodle": {
      "command": "node",
      "args": ["C:\\path\\to\\MoodleAgent\\mcp-server\\dist\\index.js"],
      "env": {
        "MOODLE_URL": "https://moodle.bgu.ac.il/moodle/",
        "MOODLE_USERNAME": "your_username",
        "MOODLE_PASSWORD": "your_password"
      }
    }
  }
}
```
