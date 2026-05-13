#!/usr/bin/env node
/**
 * MCP server entry point.
 *
 * Exposes four tools to any MCP-compatible client (Claude Desktop, Cursor, …):
 *   get_courses         — list enrolled courses
 *   get_course_content  — sections + activities for one course (by ID or name)
 *   get_assignments     — all assignment activities, optionally filtered by course
 *   force_refresh       — bypass the 24 h cache and re-scrape immediately
 *
 * Transport: stdio (the MCP client spawns this process and communicates over
 * stdin/stdout; all logging goes to stderr to avoid corrupting the protocol).
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { STALE_HOURS } from './config.js';
import {
  findCourseByNameOrId,
  getCalendarEvents,
  getCourseContent,
  getCourses,
  getLastScrapeTime,
} from './db.js';
import { runScraper } from './scraper.js';

// ── Staleness check ───────────────────────────────────────────────────────────

async function ensureFreshData(): Promise<void> {
  const lastScrape = getLastScrapeTime();
  if (lastScrape === null) {
    console.error('No cached data — running initial scrape...');
    await runScraper();
    return;
  }
  const ageHours = (Date.now() / 1000 - lastScrape) / 3600;
  if (ageHours > STALE_HOURS) {
    console.error(`Data is ${ageHours.toFixed(1)} h old — re-scraping...`);
    await runScraper();
  }
}

// ── Server ────────────────────────────────────────────────────────────────────

const server = new McpServer({ name: 'moodle-mcp', version: '0.1.0' });

server.tool(
  'get_courses',
  'Returns all enrolled Moodle courses with their IDs, names, and URLs. ' +
  'Call this when you need to browse what courses exist or resolve a course name to an ID.',
  {},
  async () => {
    await ensureFreshData();
    return {
      content: [{ type: 'text', text: JSON.stringify(getCourses(), null, 2) }],
    };
  }
);

server.tool(
  'get_course_content',
  'Returns every section and activity (lectures, assignments, resources, quizzes, …) ' +
  'inside a specific course. Pass either the numeric course ID or any part of the course name.',
  {
    course: z.string().describe('Course ID (e.g. "63443") or a partial name (e.g. "אוטומציה")'),
  },
  async ({ course }) => {
    await ensureFreshData();

    const found = findCourseByNameOrId(course);
    if (!found) {
      return {
        content: [{ type: 'text', text: `No course found matching "${course}". Try get_courses to see available courses.` }],
      };
    }

    const content = getCourseContent(found.id);
    return {
      content: [{ type: 'text', text: JSON.stringify(content, null, 2) }],
    };
  }
);

server.tool(
  'get_assignments',
  'Returns upcoming assignments from the Moodle calendar with due dates and course names. ' +
  'Results are ordered by due date ascending. Optionally filter to one course by partial name.',
  {
    course: z
      .string()
      .optional()
      .describe('Partial course name to filter by (e.g. "אוטומציה"); omit to return all upcoming assignments'),
  },
  async ({ course }) => {
    await ensureFreshData();
    const events = getCalendarEvents(course);
    return {
      content: [{ type: 'text', text: JSON.stringify(events, null, 2) }],
    };
  }
);

server.tool(
  'force_refresh',
  'Bypasses the 24-hour cache and immediately re-scrapes all Moodle course data. ' +
  'Use this when you need up-to-the-minute information.',
  {},
  async () => {
    await runScraper();
    return {
      content: [{ type: 'text', text: 'Refresh complete — database updated with latest Moodle data.' }],
    };
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
