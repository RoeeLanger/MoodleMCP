from bs4 import BeautifulSoup
from playwright.async_api import Page
from markdownify import markdownify


def _html_to_markdown(html: str, target_selector: str | None = None) -> str:
    soup = BeautifulSoup(html, "html.parser")

    for tag in soup(["script", "style", "footer", "head", "header", "aside"]):
        tag.decompose()
    for tag in soup.select(".secondary-navigation, .tertiary-navigation, nav"):
        tag.decompose()

    if target_selector:
        content = soup.select_one(target_selector)
    else:
        content = soup.select_one("#region-main, [role='main'], .main-inner")

    return markdownify(str(content or soup), heading_style="ATX").strip()


async def fetch_markdown(page: Page, url: str, target_selector: str | None = None) -> str:
    try:
        await page.goto(url, wait_until="domcontentloaded")
    except Exception:
        # Retry once with a more lenient wait — handles redirects and aborted navigations
        await page.goto(url, wait_until="commit")
    html = await page.content()
    return _html_to_markdown(html, target_selector)
