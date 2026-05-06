import asyncio
from dotenv import load_dotenv
from moodle.session import MoodleSession
from moodle.cache import build_cache
from agent.agent import create_agent

load_dotenv()


async def main():
    async with MoodleSession() as session:
        cache = await build_cache(session.page)
        agent = create_agent(session.page, cache)

        print("Moodle Assistant ready. Type 'exit' to quit.\n")
        while True:
            try:
                query = input("You: ").strip()
            except (EOFError, KeyboardInterrupt):
                break

            if not query:
                continue
            if query.lower() in ("exit", "quit"):
                break

            try:
                response = await agent.ainvoke({"messages": [("user", query)]})
                answer = response["messages"][-1].content
                print(f"\nAssistant: {answer}\n")
            except Exception as e:
                print(f"\nError: {e}\n")


if __name__ == "__main__":
    asyncio.run(main())
