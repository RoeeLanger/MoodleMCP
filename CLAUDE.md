# MoodleAgent — Project Guide

## What This Is

A read-only LLM-powered school assistant that scrapes a university Moodle instance via Playwright and answers natural-language questions about course activity, upcoming deadlines, forum posts, and calendar events.

Target audience: personal use and/or small distribution to classmates (~100 users max).

---

## Core Architecture

**Stateless RAG loop over live-scraped pages.**

User sends a query → ReAct agent selects Playwright tools → pages are scraped and converted to Markdown → LLM interprets content and returns a structured answer.

No persistent database. "New" content is defined by a time window (default: last 7 days), not by change-tracking.

---

## Key Design Decisions

### Scraping: Playwright, not Moodle REST API
The university likely does not expose the Moodle Web Services API to students. Playwright is the primary data source. If the API turns out to be available, it should replace Playwright where possible — worth checking via "Security keys" in Moodle profile settings.

### HTML Extraction Pipeline
Playwright fetches the page → strip to Markdown using `markdownify` or `html2text` → pass Markdown to LLM. Raw HTML is too noisy and token-heavy. Moodle pages render cleanly enough as Markdown for the LLM to interpret, including messy or inconsistent course/file naming schemes.

### Session Management
Use Playwright's `storage_state` (cookies + localStorage) saved to a local JSON file. Load it on startup; re-run the login flow if the session is expired. Credentials are stored in a `.env` file loaded via `python-dotenv`.

### Startup Cache (In-Memory)
On startup, scrape two pages and cache results in memory for the session:
1. Dashboard → course list `{course_name: url}`
2. Calendar → upcoming events (~2 weeks out)

This avoids re-navigating the dashboard on every tool call. All other data (forums, assignments, files) is fetched on demand. Provide a `--no-preload` flag to skip for single fast queries.

### Agent: ReAct for Now, LangGraph-Ready
Use a simple ReAct agent (LangChain) for the initial build — the toolset is small and queries are mostly single-step. Structure the code so a LangGraph "morning briefing" flow (login → check all courses → summarize new activity) can be added later without rewriting the tool layer.

### Tool Set
| Tool | Description |
|------|-------------|
| `list_courses()` | Returns from startup cache |
| `get_calendar(days=7)` | Returns from startup cache |
| `get_course_content(course)` | Scrapes main course page, sections + files |
| `get_forum_recent(course, days=7)` | Scrapes forum for recent posts |
| `get_assignments(course)` | Scrapes assignment list with due dates |

### What's Explicitly Out of Scope (for now)
- Any write/submit actions on Moodle (no form fills, no exam interaction)
- Course material ingestion / vector DB / RAG over files — deferred as a separate feature
- Persistent change-tracking database

---

## Interface (TBD)
- **Personal / GitHub shelf**: CLI entry point
- **Distribution to classmates**: Telegram bot wrapping the same core layer (FastAPI backend)

Build CLI first. Design the core scraping/LLM layer to be interface-agnostic so the bot wrapper can be added without touching internals.

---

## Stack
- **Scraping**: `playwright` (async)
- **HTML → Markdown**: `markdownify` or `html2text`
- **Orchestration**: `langchain` / `langgraph`
- **LLM**: Claude (via Anthropic SDK) — default to latest Sonnet
- **Auth / config**: `python-dotenv` + `.env`
- **Session persistence**: Playwright `storage_state` JSON file

---

## Repo Conventions
- `.env` holds credentials — never commit it, keep a `.env.example`
- `storage_state.json` holds browser session — never commit it
- Both must be in `.gitignore` from day one
