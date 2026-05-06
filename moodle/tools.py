from playwright.async_api import Page
from moodle.scraper import fetch_markdown


async def get_course_content(page: Page, course_url: str) -> str:
    return await fetch_markdown(page, course_url, target_selector=".course-content")
