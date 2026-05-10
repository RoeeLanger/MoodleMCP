/**
 * Central configuration module.
 *
 * Dotenv is loaded here — not in entry-point files — because ESM hoists all
 * `import` declarations before any top-level code executes.  If config() were
 * called in index.ts after its imports, this module would already have read
 * process.env with empty values.
 */
import { config } from 'dotenv';
import fs from 'fs';
import os from 'os';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dir = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dir, '..', '.env') });

// ── Moodle credentials ────────────────────────────────────────────────────────

export const MOODLE_URL      = process.env.MOODLE_URL      ?? 'https://moodle.bgu.ac.il/moodle/';
export const MOODLE_USERNAME = process.env.MOODLE_USERNAME ?? '';
export const MOODLE_PASSWORD = process.env.MOODLE_PASSWORD ?? '';

// ── Local data paths ──────────────────────────────────────────────────────────

export const DATA_DIR           = resolve(os.homedir(), '.moodle-mcp');
export const DB_PATH            = resolve(DATA_DIR, 'db.sqlite');
export const STORAGE_STATE_PATH = resolve(DATA_DIR, 'storage_state.json');

export const STALE_HOURS = 24;

fs.mkdirSync(DATA_DIR, { recursive: true });
