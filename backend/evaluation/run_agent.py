"""
Step 1 of the evaluation: ask the agent the questions in queries.json.

    uv run python evaluation/run_agent.py

Each question is asked as a real member of the test org who holds the
question's `ask_as` role, with their real AccessScope, so search only finds
what that person may see (same setup as scripts/try_agent.py). Saves the
answer and every document part the agent retrieved to results/answers.json.

Questions already answered are skipped, so a run stopped by a rate limit can
simply be started again. Delete results/answers.json to ask everything again.
"""
import asyncio
import json
import os
import re
import sys
import time
import uuid
from pathlib import Path

os.environ.setdefault("DEBUG", "false")   # no SQL log lines in the output

EVAL_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(EVAL_DIR.parent))

from sqlalchemy import select  # noqa: E402

from app.agent.graph import build_graph  # noqa: E402  (needs the path set above)
from app.agent.state import AgentContext, new_turn_input  # noqa: E402
from app.core.database import async_session, engine  # noqa: E402
from app.models import OrgMember, Role, Team, TeamMember, User  # noqa: E402
from app.scope.resolver import resolve_scope  # noqa: E402

QUERIES = EVAL_DIR / "queries.json"
ANSWERS = EVAL_DIR / "results" / "answers.json"
PAUSE_SECONDS = 20  # between questions, to stay under the free Gemini per-minute limit

_CITATION = re.compile(r"\s*\[[0-9a-f]{8}(?:[,\s]+[0-9a-f]{8})*\]")
_UNVERIFIED_NOTE = re.compile(r"\s*_\(\d+ sources? couldn't be verified\.\)_\s*$")


def clean_answer(text: str) -> str:
    """The answer as the user reads it, without citation tags like [3f9a12bc]."""
    return _UNVERIFIED_NOTE.sub("", _CITATION.sub("", text)).strip()


async def context_for(role_name: str) -> tuple[AgentContext, str]:
    """
    The AgentContext of the (first) member who holds `role_name` as their
    org-level role or, if nobody does, as a team role. Team roles count for
    document visibility too, so either way they see what that role sees.
    """
    async with async_session() as db:
        rows = (
            await db.execute(
                select(User, OrgMember.org_id)
                .join(OrgMember, OrgMember.user_id == User.id)
                .join(Role, Role.id == OrgMember.role_id)
                .where(Role.name == role_name)
                .order_by(User.name)
            )
        ).all() or (
            await db.execute(
                select(User, Team.org_id)
                .join(TeamMember, TeamMember.user_id == User.id)
                .join(Team, Team.id == TeamMember.team_id)
                .join(Role, Role.id == TeamMember.role_id)
                .where(Role.name == role_name)
                .order_by(User.name)
            )
        ).all()
        if not rows:
            sys.exit(f"Nobody holds the role {role_name!r}. Check the test org (plans/documents/test-files).")
        user, org_id = rows[0]
        scope = await resolve_scope(user.id, org_id, db)
    return AgentContext(scope=scope, audit_id=uuid.uuid4()), user.name


async def ask(graph, context: AgentContext, question: str) -> dict:
    """One question in a fresh chat; returns what step 2 needs."""
    started = time.perf_counter()
    state = await graph.ainvoke(
        new_turn_input(question),
        {"configurable": {"thread_id": str(uuid.uuid4())}},
        context=context,
    )
    seconds = round(time.perf_counter() - started, 1)

    searches = [
        call["args"].get("query", "")
        for message in state["messages"]
        for call in getattr(message, "tool_calls", None) or []
        if call["name"] == "search_documents"
    ]
    answer = state["messages"][-1].text
    return {
        "route": state["intent"],
        "searches": searches,
        "rewrites": state["rewrite_count"],
        "answer": answer,
        "answer_clean": clean_answer(answer),
        "retrieval_context": [
            {"title": c["title"], "part": c["chunk_index"] + 1, "text": c["text"]}
            for c in state["retrieved_chunks"]
        ],
        "cited_parts": len(state["verified_citation_ids"]),
        "seconds": seconds,
    }


def load_answers() -> dict[int, dict]:
    if not ANSWERS.exists():
        return {}
    return {item["id"]: item for item in json.loads(ANSWERS.read_text(encoding="utf-8"))}


def save_answers(answers: dict[int, dict]) -> None:
    ANSWERS.parent.mkdir(exist_ok=True)
    ANSWERS.write_text(
        json.dumps([answers[k] for k in sorted(answers)], indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


async def main() -> None:
    queries = json.loads(QUERIES.read_text(encoding="utf-8"))
    answers = load_answers()
    graph = build_graph()
    contexts: dict[str, tuple[AgentContext, str]] = {}

    todo = [q for q in queries if "answer" not in answers.get(q["id"], {})]
    print(f"{len(queries) - len(todo)} already answered, {len(todo)} to ask.\n")

    for n, query in enumerate(todo):
        if n:
            await asyncio.sleep(PAUSE_SECONDS)
        if query["ask_as"] not in contexts:
            contexts[query["ask_as"]] = await context_for(query["ask_as"])
        context, user_name = contexts[query["ask_as"]]

        print(f"[{query['id']}] {user_name} ({query['ask_as']}): {query['question']}")
        try:
            result = await ask(graph, context, query["question"])
        except Exception as exc:  # e.g. the free daily quota ran out
            print(f"     failed: {exc}\n     Saved what's done; run again later to continue.")
            break
        answers[query["id"]] = {**query, "asked_as_user": user_name, **result}
        save_answers(answers)

        searched = f"searched {len(result['searches'])}x" if result["searches"] else "NO SEARCH"
        print(f"     route={result['route']}, {searched}, {len(result['retrieval_context'])} parts, "
              f"{result['seconds']}s\n     {result['answer_clean'][:160]}\n")

    await engine.dispose()
    done = sum(1 for a in answers.values() if "answer" in a)
    print(f"{done}/{len(queries)} answered. Results: {ANSWERS.relative_to(EVAL_DIR.parent)}")


if __name__ == "__main__":
    asyncio.run(main())
