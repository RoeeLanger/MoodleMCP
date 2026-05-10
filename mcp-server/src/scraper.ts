/**
 * Playwright scraper — logs into Moodle, discovers enrolled courses, and
 * extracts the section/activity structure from each course page.
 *
 * All scraped data is written straight to SQLite via the db helpers; no
 * intermediate representation is returned to callers.
 */
import { createHash } from 'crypto';
import fs from 'fs';
import { chromium, type BrowserContext } from 'playwright';
import {
  MOODLE_PASSWORD,
  MOODLE_URL,
  MOODLE_USERNAME,
  STORAGE_STATE_PATH,
} from './config.js';
import {
  deleteSectionsAndActivities,
  getCourses,
  upsertActivity,
  upsertCourse,
  upsertSection,
  type Course,
} from './db.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function hashId(input: string): string {
  return createHash('md5').update(input).digest('hex').slice(0, 12);
}

/**
 * Returns the visible text of the first element matching `selector` inside
 * `root`, stripping Moodle's `.accesshide` spans (screen-reader-only suffixes
 * like "Assignment" or "Quiz" that would otherwise pollute activity names).
 */
async function visibleText(
  selector: string,
  root: import('playwright').Locator
): Promise<string> {
  const el = root.locator(selector).first();
  if (!(await el.count())) return '';
  return el.evaluate((node) => {
    const clone = node.cloneNode(true) as Element;
    clone.querySelectorAll('.accesshide').forEach((h) => h.remove());
    return clone.textContent?.trim() ?? '';
  });
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function ensureLoggedIn(context: BrowserContext): Promise<void> {
  const page = await context.newPage();
  try {
    await page.goto(MOODLE_URL + 'login/index.php', { waitUntil: 'networkidle' });

    // If the login form is absent the existing session is still valid
    if (!(await page.$('.login-form-username'))) {
      console.error('Session still valid, skipping login.');
      return;
    }

    console.error('Session expired — logging in...');
    await page.fill('.login-form-username input', MOODLE_USERNAME);
    await page.fill('.login-form-password input', MOODLE_PASSWORD);
    await page.click("button[type='submit']");
    await page.waitForURL(`${MOODLE_URL}**`, { timeout: 15_000 });
    await context.storageState({ path: STORAGE_STATE_PATH });
    console.error(`Logged in: ${page.url()}`);
  } finally {
    await page.close();
  }
}

// ── Course discovery ──────────────────────────────────────────────────────────

async function scrapeCourses(context: BrowserContext): Promise<Course[]> {
  console.error('Scraping courses from dashboard...');
  const page = await context.newPage();
  const courses: Course[] = [];

  try {
    await page.goto(MOODLE_URL + 'my/', { waitUntil: 'networkidle' });

    // Strategy 1: course-listitem cards (BGU's custom dashboard layout)
    const items = page.locator('li.course-listitem');
    if (await items.count()) {
      console.error(`  Using li.course-listitem (${await items.count()} items)`);
      for (let i = 0; i < (await items.count()); i++) {
        const link = items.nth(i).locator('a.aalinkcoursename').first();
        if (!(await link.count())) continue;
        const name = (await link.innerText()).trim();
        const href = await link.getAttribute('href');
        if (!name || !href) continue;
        const id = href.match(/[?&]id=(\d+)/)?.[1] ?? hashId(href);
        upsertCourse(id, name, href);
        courses.push({ id, name, url: href, last_scraped: Math.floor(Date.now() / 1000) });
      }
    } else {
      // Strategy 2: generic fallback — any anchor linking to a course view page
      console.error('  li.course-listitem matched 0 — falling back to a[href*="/course/view.php"]');
      const anchors = await page.$$('a[href*="/course/view.php"]');
      const seen = new Set<string>();
      for (const anchor of anchors) {
        const name = (await anchor.innerText()).trim();
        const href = await anchor.getAttribute('href');
        if (!name || !href || seen.has(href)) continue;
        seen.add(href);
        const id = href.match(/[?&]id=(\d+)/)?.[1] ?? hashId(href);
        upsertCourse(id, name, href);
        courses.push({ id, name, url: href, last_scraped: Math.floor(Date.now() / 1000) });
      }
    }

    console.error(`  Courses found: ${courses.length}`);
  } finally {
    await page.close();
  }

  return courses;
}

// ── Course content ────────────────────────────────────────────────────────────

async function scrapeCourseContent(context: BrowserContext, course: Course): Promise<void> {
  console.error(`  Scraping: ${course.name}`);
  const page = await context.newPage();

  try {
    await page.goto(course.url, { waitUntil: 'networkidle' });

    const topicsList = page.locator('ul.topics');
    if (!(await topicsList.count())) {
      const preview = (await page.locator('body').innerText())
        .replace(/\s+/g, ' ')
        .slice(0, 300);
      console.error(`    ✗ ul.topics not found on ${page.url()}`);
      console.error(`    Body preview: ${preview}`);
      return;
    }

    // Wipe stale data before reinserting so removed content doesn't linger
    deleteSectionsAndActivities(course.id);

    const sectionEls = topicsList.locator(':scope > li');
    const sectionCount = await sectionEls.count();
    console.error(`    ✓ ${sectionCount} sections`);

    for (let sIdx = 0; sIdx < sectionCount; sIdx++) {
      const sectionEl = sectionEls.nth(sIdx);

      // Try progressively broader selectors for the section heading
      const sectionName =
        (await visibleText('.sectionname', sectionEl)) ||
        (await visibleText('.section_title h3', sectionEl)) ||
        (await visibleText('h3', sectionEl)) ||
        `Section ${sIdx + 1}`;

      const sectionHtmlId = (await sectionEl.getAttribute('id')) ?? `s${sIdx}`;
      const sectionId = `${course.id}_${sectionHtmlId}`;

      upsertSection({ id: sectionId, course_id: course.id, name: sectionName, position: sIdx });

      const activityEls = sectionEl.locator('li.activity');
      const activityCount = await activityEls.count();

      for (let aIdx = 0; aIdx < activityCount; aIdx++) {
        const actEl = activityEls.nth(aIdx);

        const actName =
          (await visibleText('.instancename', actEl)) ||
          (await visibleText('a', actEl));
        if (!actName) continue;

        const actLink = actEl.locator('a').first();
        const actUrl = (await actLink.count()) ? await actLink.getAttribute('href') : null;

        // e.g. class="activity assign modtype_assign" → type = "assign"
        const classAttr = (await actEl.getAttribute('class')) ?? '';
        const actType = classAttr.match(/modtype_(\w+)/)?.[1] ?? null;

        const actId =
          actUrl?.match(/[?&]id=(\d+)/)?.[1] ?? hashId(sectionId + actName + aIdx);

        upsertActivity({
          id: actId,
          section_id: sectionId,
          course_id: course.id,
          name: actName,
          type: actType,
          url: actUrl ?? null,
          position: aIdx,
        });
      }
    }
  } finally {
    await page.close();
  }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export async function runScraper(): Promise<void> {
  if (!MOODLE_USERNAME || !MOODLE_PASSWORD) {
    throw new Error('MOODLE_USERNAME and MOODLE_PASSWORD must be set in .env or the MCP client env block.');
  }

  const browser = await chromium.launch({ headless: true });
  const context = fs.existsSync(STORAGE_STATE_PATH)
    ? await browser.newContext({ storageState: STORAGE_STATE_PATH })
    : await browser.newContext();

  try {
    await ensureLoggedIn(context);
    let courses = await scrapeCourses(context);

    // If the dashboard selector failed (JS timing, layout change), fall back to
    // courses already in the DB so content scraping still runs.
    if (courses.length === 0) {
      const stored = getCourses();
      if (stored.length > 0) {
        console.error(`  Falling back to ${stored.length} courses from DB.`);
        courses = stored;
      }
    }

    console.error(`Scraping content for ${courses.length} courses...`);
    for (const course of courses) {
      await scrapeCourseContent(context, course);
    }

    await context.storageState({ path: STORAGE_STATE_PATH });
    console.error('Scrape complete.');
  } finally {
    await browser.close();
  }
}
