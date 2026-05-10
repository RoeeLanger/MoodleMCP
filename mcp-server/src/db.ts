/**
 * SQLite database — schema, typed interfaces, and query helpers.
 *
 * Schema overview:
 *   courses   → sections   → activities
 *
 * All write operations use INSERT … ON CONFLICT DO UPDATE so the scraper can
 * safely re-run without duplicating data.
 */
import Database from 'better-sqlite3';
import { DB_PATH } from './config.js';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS courses (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    url          TEXT NOT NULL,
    last_scraped INTEGER
  );

  CREATE TABLE IF NOT EXISTS sections (
    id        TEXT PRIMARY KEY,
    course_id TEXT NOT NULL REFERENCES courses(id),
    name      TEXT NOT NULL,
    position  INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS activities (
    id         TEXT PRIMARY KEY,
    section_id TEXT NOT NULL REFERENCES sections(id),
    course_id  TEXT NOT NULL REFERENCES courses(id),
    name       TEXT NOT NULL,
    type       TEXT,
    url        TEXT,
    position   INTEGER NOT NULL
  );
`);

// ── Interfaces ────────────────────────────────────────────────────────────────

export interface Course {
  id: string;
  name: string;
  url: string;
  last_scraped: number | null;
}

export interface Section {
  id: string;
  course_id: string;
  name: string;
  position: number;
}

export interface Activity {
  id: string;
  section_id: string;
  course_id: string;
  name: string;
  type: string | null;
  url: string | null;
  position: number;
}

export interface CourseContent {
  course: Course;
  sections: Array<Section & { activities: Activity[] }>;
}

export interface AssignmentRow extends Activity {
  course_name: string;
  section_name: string;
}

// ── Reads ─────────────────────────────────────────────────────────────────────

export function getCourses(): Course[] {
  return db.prepare('SELECT * FROM courses ORDER BY name').all() as Course[];
}

/** Matches by exact ID first, then falls back to a case-insensitive name substring. */
export function findCourseByNameOrId(query: string): Course | null {
  const byId = db
    .prepare('SELECT * FROM courses WHERE id = ?')
    .get(query) as Course | undefined;
  if (byId) return byId;

  const byName = db
    .prepare('SELECT * FROM courses WHERE name LIKE ? ORDER BY name LIMIT 1')
    .get(`%${query}%`) as Course | undefined;
  return byName ?? null;
}

export function getCourseContent(courseId: string): CourseContent | null {
  const course = db
    .prepare('SELECT * FROM courses WHERE id = ?')
    .get(courseId) as Course | undefined;
  if (!course) return null;

  const sections = db
    .prepare('SELECT * FROM sections WHERE course_id = ? ORDER BY position')
    .all(courseId) as Section[];

  const sectionsWithActivities = sections.map((s) => ({
    ...s,
    activities: db
      .prepare('SELECT * FROM activities WHERE section_id = ? ORDER BY position')
      .all(s.id) as Activity[],
  }));

  return { course, sections: sectionsWithActivities };
}

/** Returns all activities with type = 'assign', optionally filtered to one course. */
export function getAssignments(courseId?: string): AssignmentRow[] {
  const params: string[] = ['assign'];
  const courseFilter = courseId ? 'AND a.course_id = ?' : '';
  if (courseId) params.push(courseId);

  return db
    .prepare(
      `SELECT a.*, c.name AS course_name, s.name AS section_name
       FROM activities a
       JOIN courses  c ON a.course_id  = c.id
       JOIN sections s ON a.section_id = s.id
       WHERE a.type = ? ${courseFilter}
       ORDER BY c.name, s.position, a.position`
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .all(...(params as any[])) as AssignmentRow[];
}

export function getLastScrapeTime(): number | null {
  const row = db
    .prepare('SELECT MAX(last_scraped) AS last FROM courses')
    .get() as { last: number | null };
  return row?.last ?? null;
}

// ── Writes ────────────────────────────────────────────────────────────────────

export function upsertCourse(id: string, name: string, url: string): void {
  db.prepare(
    `INSERT INTO courses (id, name, url, last_scraped)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name         = excluded.name,
       url          = excluded.url,
       last_scraped = excluded.last_scraped`
  ).run(id, name, url, Math.floor(Date.now() / 1000));
}

export function upsertSection(s: Section): void {
  db.prepare(
    `INSERT INTO sections (id, course_id, name, position)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name     = excluded.name,
       position = excluded.position`
  ).run(s.id, s.course_id, s.name, s.position);
}

export function upsertActivity(a: Activity): void {
  db.prepare(
    `INSERT INTO activities (id, section_id, course_id, name, type, url, position)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name     = excluded.name,
       type     = excluded.type,
       url      = excluded.url,
       position = excluded.position`
  ).run(a.id, a.section_id, a.course_id, a.name, a.type, a.url, a.position);
}

/** Clears all sections and activities for a course before re-inserting them.
 *  Prevents ghost entries when a lecturer removes content between scrapes. */
export function deleteSectionsAndActivities(courseId: string): void {
  db.prepare('DELETE FROM activities WHERE course_id = ?').run(courseId);
  db.prepare('DELETE FROM sections   WHERE course_id = ?').run(courseId);
}

export default db;
