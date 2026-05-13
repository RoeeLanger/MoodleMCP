#!/usr/bin/env node
// Run after build: node dist/dump.js
// Always does a fresh scrape so you see the current state of the DB.
import { runScraper } from './scraper.js';
import { getCalendarEvents, getCourseContent, getCourses } from './db.js';

console.log('Running scraper...\n');
await runScraper();

const courses = getCourses();
console.log(`\n=== COURSES (${courses.length}) ===`);

for (const course of courses) {
  const content = getCourseContent(course.id);
  const sectionCount = content?.sections.length ?? 0;
  const actCount = content?.sections.reduce((n, s) => n + s.activities.length, 0) ?? 0;

  console.log(`\n[${course.id}] ${course.name}  (${sectionCount} sections, ${actCount} activities)`);

  if (!content || sectionCount === 0) {
    console.log('  (no sections found)');
    continue;
  }

  for (const section of content.sections) {
    console.log(`  § ${section.name}`);
    if (section.activities.length === 0) {
      console.log('      (no activities)');
    }
    for (const act of section.activities) {
      const type = act.type ? ` [${act.type}]` : '';
      console.log(`      • ${act.name}${type}`);
    }
  }
}

const events = getCalendarEvents();
console.log(`\n=== UPCOMING CALENDAR EVENTS (${events.length}) ===`);
if (events.length === 0) {
  console.log('  (none)');
}
for (const ev of events) {
  const due = ev.due_iso ?? 'no due date';
  console.log(`  • [${due}]  ${ev.name}  —  ${ev.course_name}`);
  if (ev.url) console.log(`      ${ev.url}`);
}
