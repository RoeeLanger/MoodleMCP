from langchain_core.tools import tool
from playwright.async_api import Page
from moodle.cache import MoodleCache
from moodle.tools import get_course_content as _scrape_course


def make_tools(page: Page, cache: MoodleCache) -> list:

    @tool
    def list_courses() -> str:
        """List all Moodle courses the student is enrolled in."""
        if not cache.courses:
            return "No courses found."
        return "\n".join(f"- {name}" for name in cache.courses)

    @tool
    def get_calendar() -> str:
        """Get upcoming calendar events and deadlines across all courses."""
        if not cache.events:
            return "No upcoming events."
        return "\n".join(
            f"- [{e.date}] {e.title} ({e.course})" for e in cache.events
        )

    @tool
    async def get_course_content(course_name: str) -> str:
        """Get the full content sections and resources of a specific course.
        Call list_courses first to get the exact course name."""
        # Exact match first, then partial
        url = cache.courses.get(course_name)
        if not url:
            for name, u in cache.courses.items():
                if course_name.lower() in name.lower():
                    url = u
                    break

        if not url:
            return (
                f"Course '{course_name}' not found. "
                f"Available: {', '.join(cache.courses)}"
            )

        return await _scrape_course(page, url)

    return [list_courses, get_calendar, get_course_content]
