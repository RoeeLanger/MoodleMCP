import os
from playwright.async_api import Page
from langchain_anthropic import ChatAnthropic
from langgraph.prebuilt import create_react_agent
from moodle.cache import MoodleCache
from agent.tools import make_tools

SYSTEM_PROMPT = """You are a helpful school assistant with access to the student's Moodle account.
You can look up course content, upcoming deadlines, and calendar events.

Guidelines:
- Call list_courses first whenever you need to find a specific course — course names may be in Hebrew.
- For deadline or schedule questions, prefer get_calendar before scraping individual courses.
- get_course_content returns the course sections and all linked resources and activities.
- Answer in the same language the user wrote in.
- Be concise. Summarize scraped content rather than dumping it raw."""


def create_agent(page: Page, cache: MoodleCache):
    llm = ChatAnthropic(
        model="claude-sonnet-4-6",
        api_key=os.getenv("ANTHROPIC_API_KEY"),
    )
    tools = make_tools(page, cache)
    return create_react_agent(llm, tools, prompt=SYSTEM_PROMPT)
