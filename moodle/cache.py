import os
from dataclasses import dataclass, field
from playwright.async_api import Page

MOODLE_URL = os.getenv("MOODLE_URL", "https://moodle.bgu.ac.il/moodle/")


@dataclass
class CalendarEvent:
    title: str
    date: str
    course: str
    url: str | None = None


@dataclass
class MoodleCache:
    courses: dict[str, str] = field(default_factory=dict)  # name -> url
    events: list[CalendarEvent] = field(default_factory=list)


async def _scrape_courses(page: Page) -> dict[str, str]:
    # BGU uses a custom dashboard — try both URLs and wait for JS to finish
    for url in [
        MOODLE_URL + "my/"
    ]:
        await page.goto(url, wait_until="networkidle")
        anchors = await page.query_selector_all('a[href*="/course/view.php"]')
        seen_urls = set()
        courses = {}
        for anchor in anchors:
            name = (await anchor.inner_text()).strip()
            href = await anchor.get_attribute("href")
            if name and href and href not in seen_urls:
                seen_urls.add(href)
                courses[name] = href
        if courses:
            return courses

    return {}


async def _scrape_calendar(page: Page) -> list[CalendarEvent]:
    await page.goto(
        MOODLE_URL + "calendar/view.php?view=upcoming",
        wait_until="domcontentloaded",
    )

    events = []

    event_elements = await page.query_selector_all(".event")
    for el in event_elements:
        title_el = await el.query_selector(".referer a, h3 a, .name a")
        date_el = await el.query_selector(".date, time, .when")
        course_el = await el.query_selector(".course-info, .description a, .course a")

        title = (await title_el.inner_text()).strip() if title_el else "Unknown"
        date = (await date_el.inner_text()).strip() if date_el else ""
        course = (await course_el.inner_text()).strip() if course_el else ""
        url = await title_el.get_attribute("href") if title_el else None

        events.append(CalendarEvent(title=title, date=date, course=course, url=url))

    return events


async def build_cache(page: Page) -> MoodleCache:
    print("Building startup cache...")

    courses = await _scrape_courses(page)
    print(f"  Found {len(courses)} courses")

    events = await _scrape_calendar(page)
    print(f"  Found {len(events)} upcoming calendar events")

    return MoodleCache(courses=courses, events=events)
