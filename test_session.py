import asyncio
import traceback
from moodle.session import MoodleSession
from moodle.cache import build_cache
from moodle.tools import get_course_content


async def main():
    async with MoodleSession() as session:
        cache = await build_cache(session.page)

        print("Courses found:")
        for name in cache.courses:
            print(f"  {name}")

        # Pick the first course to test all three scrapers
        course_name, course_url = next(iter(cache.courses.items()))
        print(f"\nTesting scrapers on: {course_name}\n")

        try:
            print("--- Course Content (first 1000 chars) ---")
            content = await get_course_content(session.page, course_url)
            print(content[:1000])

        except Exception:
            traceback.print_exc()
            await session.page.screenshot(path="error_screenshot.png")
            print("Screenshot saved.")

        input("\nPress Enter to close...")


if __name__ == "__main__":
    asyncio.run(main())
