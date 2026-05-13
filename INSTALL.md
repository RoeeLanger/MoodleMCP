# MoodleAgent — Installation Guide

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or newer
- npm (bundled with Node.js)

---

## 1. Install Dependencies

From the repo root, run:

```
cd mcp-server
npm install
npx playwright install chromium
```

---

## 2. Set Up Credentials

Copy the example env file and fill in your Moodle details:

```
copy .env.example .env
```

Open `mcp-server/.env` and edit the three values:

```
MOODLE_URL=https://moodle.bgu.ac.il/moodle/
MOODLE_USERNAME=your_username
MOODLE_PASSWORD=your_password
```

- **MOODLE_URL** — base URL of your Moodle instance (keep the trailing slash)
- **MOODLE_USERNAME** — your Moodle login username
- **MOODLE_PASSWORD** — your Moodle login password

> The `.env` file is gitignored and never committed.

---

## 3. Build the Server

```
npm run build
```

This compiles TypeScript into `mcp-server/dist/`.

---

## 4. Wire into Claude Desktop

Add the following to `%APPDATA%\Claude\claude_desktop_config.json`
(create the file if it does not exist):

```json
{
  "mcpServers": {
    "moodle": {
      "command": "node",
      "args": ["C:\\full\\path\\to\\MoodleAgent\\mcp-server\\dist\\index.js"],
      "env": {
        "MOODLE_URL": "https://moodle.bgu.ac.il/moodle/",
        "MOODLE_USERNAME": "your_username",
        "MOODLE_PASSWORD": "your_password"
      }
    }
  }
}
```

Replace the path and credentials with your own values, then restart Claude Desktop.

---

## 5. First Run

On the first tool call Claude makes, the scraper will:

1. Launch a headless browser and log in to Moodle
2. Save the session to `~/.moodle-mcp/storage_state.json`
3. Populate the local SQLite database at `~/.moodle-mcp/db.sqlite`

Subsequent calls reuse the cached session and only re-scrape after 24 hours.

---

## Available MCP Tools

| Tool | Description |
|---|---|
| `get_courses` | Lists all enrolled courses |
| `get_assignments` | Assignments with due dates (optional: course filter, day range) |
| `get_events` | Upcoming calendar events |
| `force_refresh` | Bypass the 24 h cache and re-scrape immediately |
