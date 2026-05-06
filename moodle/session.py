import os
from pathlib import Path
from playwright.async_api import async_playwright, Browser, BrowserContext, Page
from dotenv import load_dotenv

load_dotenv()

MOODLE_URL = os.getenv("MOODLE_URL", "https://moodle.bgu.ac.il/moodle/")
USERNAME = os.getenv("MOODLE_USERNAME")
PASSWORD = os.getenv("MOODLE_PASSWORD")
STORAGE_STATE_PATH = Path("storage_state.json")


async def _ensure_logged_in(page: Page) -> None:
    await page.goto(MOODLE_URL + "login/index.php", wait_until="networkidle")

    login_form = await page.query_selector(".login-form-username")
    if not login_form:
        print("  Session still valid, skipping login.")
        return

    print("  Session expired or missing — logging in...")
    await page.fill(".login-form-username input", USERNAME)
    await page.fill(".login-form-password input", PASSWORD)
    await page.click("button[type='submit']")

    await page.wait_for_url(f"{MOODLE_URL}**", timeout=15000)
    print(f"  Logged in: {page.url}")


class MoodleSession:
    def __init__(self):
        self._playwright = None
        self._browser: Browser | None = None
        self.context: BrowserContext | None = None
        self.page: Page | None = None

    async def start(self) -> None:
        self._playwright = await async_playwright().start()
        self._browser = await self._playwright.chromium.launch(headless=True)

        if STORAGE_STATE_PATH.exists():
            self.context = await self._browser.new_context(
                storage_state=str(STORAGE_STATE_PATH)
            )
        else:
            self.context = await self._browser.new_context()

        self.page = await self.context.new_page()

        await _ensure_logged_in(self.page)
        await self.context.storage_state(path=str(STORAGE_STATE_PATH))

    async def close(self) -> None:
        if self.context:
            await self.context.storage_state(path=str(STORAGE_STATE_PATH))
        if self._browser:
            await self._browser.close()
        if self._playwright:
            await self._playwright.stop()

    async def __aenter__(self):
        await self.start()
        return self

    async def __aexit__(self, *args):
        await self.close()
