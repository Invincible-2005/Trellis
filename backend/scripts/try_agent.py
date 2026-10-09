"""
Chat with the agent in the terminal as a real user (optional helper, ticket 12 D19).

    uv run python scripts/try_agent.py you@example.com
    uv run python scripts/try_agent.py you@example.com "Acme Corp"

Uses the user's real AccessScope, so answers only contain what they may see.
Needs DATABASE_URL and GOOGLE_API_KEY in backend/.env. Memory lasts until you
quit (no checkpoint file is written). Type "exit" to quit.
"""
import asyncio
import sys
import uuid
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BACKEND_DIR))

from langgraph.checkpoint.memory import InMemorySaver  # noqa: E402
from sqlalchemy import select  # noqa: E402

from app.agent.graph import build_graph  # noqa: E402  (needs the path set above)
from app.agent.state import AgentContext, new_turn_input  # noqa: E402
from app.core.database import async_session, engine  # noqa: E402
from app.models import Organization, OrgMember, User  # noqa: E402
from app.scope.resolver import resolve_scope  # noqa: E402

ANSWER_NODES = {"read_agent", "not_found"}


async def load_context(email: str, org_name: str | None) -> tuple[AgentContext, str, str]:
    async with async_session() as db:
        user = await db.scalar(select(User).where(User.email == email))
        if user is None:
            sys.exit(f"No user with email {email}.")
        stmt = (
            select(Organization)
            .join(OrgMember, OrgMember.org_id == Organization.id)
            .where(OrgMember.user_id == user.id)
        )
        if org_name:
            stmt = stmt.where(Organization.name == org_name)
        org = (await db.scalars(stmt)).first()
        if org is None:
            sys.exit(f"{email} isn't a member of {org_name or 'any org'}.")
        scope = await resolve_scope(user.id, org.id, db)
    return AgentContext(scope=scope, audit_id=uuid.uuid4()), user.name, org.name


async def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    context, user_name, org_name = await load_context(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    graph = build_graph(InMemorySaver())
    config = {"configurable": {"thread_id": "terminal"}}
    print(f"Chatting as {user_name} in {org_name}. Type 'exit' to quit.\n")

    while True:
        text = input("you> ").strip()
        if text.lower() in {"exit", "quit"}:
            break
        if not text:
            continue
        print("trellis> ", end="", flush=True)
        async for mode, data in graph.astream(
            new_turn_input(text), config, context=context, stream_mode=["messages", "updates"]
        ):
            if mode == "messages":
                chunk, meta = data
                if meta.get("langgraph_node") in ANSWER_NODES and chunk.text:
                    print(chunk.text, end="", flush=True)
            elif "write_not_ready" in data:
                print(data["write_not_ready"]["messages"][-1].text, end="")
            elif "tools" in data:
                names = ", ".join(m.name for m in data["tools"]["messages"])
                print(f"\n  [used: {names}]\n", end="", flush=True)
            elif "rewrite" in data:
                print("\n  [searching again]\n", end="", flush=True)

        state = (await graph.aget_state(config)).values
        chunks = {c["chunk_id"]: c for c in state["retrieved_chunks"]}
        print()
        for chunk_id in state["verified_citation_ids"]:
            print(f"  source: {chunks[chunk_id]['title']} (part {chunks[chunk_id]['chunk_index'] + 1})")
        if state["dropped_citation_count"]:
            print(f"  note: {state['dropped_citation_count']} source(s) couldn't be verified")
        print()

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
