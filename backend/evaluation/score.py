"""
Step 2 of the evaluation: score the saved answers with DeepEval.

    uv run python evaluation/score.py               # round 1: results/
    uv run python evaluation/score.py kestrel-org   # round 2: kestrel-org/results/

Reads results/answers.json (from run_agent.py), scores every answer on five
metrics, and writes results/scores.json and results/report.md.

"Must not answer" questions ("expect": "refuse") get no AI judge: they pass when
search reached no part of the forbidden document and the answer contains none of
its facts (marker phrases). That checks permissions, which the five metrics don't.

The judge is Gemini Flash-Lite, the agent's own model (ticket 12 D57): Flash's
free tier allows only ~20 requests a day and a run needs ~200. DeepEval splits
each score into small yes/no checks against the document text, which keeps a
small judge honest; the report names the judge.

Calls go one at a time with a pause between them (free tier). Each score is
saved as soon as it's ready, so a run stopped by the daily limit continues
where it stopped. An answer that changed since it was scored is scored again.
"""
import json
import os
import sys
import time
from datetime import date
from pathlib import Path

os.environ.setdefault("DEEPEVAL_TELEMETRY_OPT_OUT", "1")
os.environ.setdefault("DEEPEVAL_DISABLE_DOTENV", "1")   # settings come from app config below

EVAL_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(EVAL_DIR.parent))

import deepeval  # noqa: E402
from deepeval.metrics import (  # noqa: E402
    AnswerRelevancyMetric,
    ContextualPrecisionMetric,
    ContextualRecallMetric,
    ContextualRelevancyMetric,
    FaithfulnessMetric,
)
from deepeval.models import GeminiModel  # noqa: E402
from deepeval.test_case import LLMTestCase  # noqa: E402

from app.core.config import settings  # noqa: E402

QUESTION_SET = sys.argv[1] if len(sys.argv) > 1 else None
SET_DIR = EVAL_DIR / QUESTION_SET if QUESTION_SET else EVAL_DIR
RESULTS_DIR = SET_DIR / (sys.argv[2] if len(sys.argv) > 2 else "results")  # e.g. results-sections for a rerun
QUERIES = SET_DIR / "queries.json"
ANSWERS = RESULTS_DIR / "answers.json"
SCORES = RESULTS_DIR / "scores.json"
REPORT = RESULTS_DIR / "report.md"

# A fixed version, not "-latest", so reruns are graded by the same judge.
# On 2026-10-16 the agent's "gemini-flash-lite-latest" pointed to this same model.
JUDGE_MODEL = "gemini-3.5-flash-lite"
JUDGE_GAP_SECONDS = 7   # at most ~8 judge calls a minute
BUSY_RETRIES = 5        # tries per metric when Gemini says it's overloaded
BUSY_WAIT_SECONDS = 60
PASS_MARK = 0.5

METRICS = {
    "Context Relevancy": ContextualRelevancyMetric,
    "Context Precision": ContextualPrecisionMetric,
    "Context Recall": ContextualRecallMetric,
    "Faithfulness": FaithfulnessMetric,
    "Answer Relevancy": AnswerRelevancyMetric,
}
NEEDS_DOCUMENTS = {"Context Relevancy", "Context Precision", "Context Recall", "Faithfulness"}

MEANINGS = {
    "Context Relevancy": "How much of what search returned is about the question. Search always "
                         "returns 6 document parts and most questions need only one, so this is "
                         "low by design.",
    "Context Precision": "Whether the parts that hold the answer are ranked at the top of the search results.",
    "Context Recall": "Whether the parts search found contain everything in the expected answer.",
    "Faithfulness": "Whether every claim in the answer is backed by the parts found (no made-up facts).",
    "Answer Relevancy": "Whether the answer sticks to the question asked.",
}


class PacedGemini(GeminiModel):
    """The judge, with a pause before every call to stay under the free per-minute limit."""

    _last_call = 0.0

    def _wait(self) -> None:
        gap = JUDGE_GAP_SECONDS - (time.monotonic() - self._last_call)
        if gap > 0:
            time.sleep(gap)
        self._last_call = time.monotonic()

    def generate(self, *args, **kwargs):
        self._wait()
        return super().generate(*args, **kwargs)

    async def a_generate(self, *args, **kwargs):
        self._wait()
        return await super().a_generate(*args, **kwargs)


def test_case(answer: dict) -> LLMTestCase:
    return LLMTestCase(
        input=answer["question"],
        actual_output=answer["answer_clean"],
        expected_output=answer["expected_answer"],
        retrieval_context=[
            f"{part['title']} (part {part['part']})\n{part['text']}" for part in answer["retrieval_context"]
        ],
    )


def load_scores() -> dict[int, dict]:
    if not SCORES.exists():
        return {}
    return {item["id"]: item for item in json.loads(SCORES.read_text(encoding="utf-8"))}


def save_scores(scores: dict[int, dict]) -> None:
    SCORES.write_text(
        json.dumps([scores[k] for k in sorted(scores)], indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )


def measure_with_patience(metric, case: LLMTestCase) -> bool:
    """
    Run one metric. A "model overloaded" reply (503) is common on the free tier
    and passes in a minute or two, as does a dropped connection, so wait and
    try again; any other error (e.g. the daily limit) stops the run.
    """
    for attempt in range(1, BUSY_RETRIES + 1):
        try:
            metric.measure(case, _show_indicator=False)
            return True
        except Exception as exc:
            busy = any(sign in str(exc) for sign in ("503", "UNAVAILABLE", "500 INTERNAL", "PerMinute", "disconnected", "Connection", "timed out"))
            if not busy or attempt == BUSY_RETRIES:
                print(f"failed: {str(exc)[:200]}")
                return False
            print(f"judge busy, waiting {BUSY_WAIT_SECONDS}s ...", end=" ", flush=True)
            time.sleep(BUSY_WAIT_SECONDS)
    return False


def score_all(answers: list[dict], scores: dict[int, dict]) -> bool:
    """Fill in missing scores. Returns False if a judge call failed (usually the daily limit)."""
    judge = PacedGemini(model=JUDGE_MODEL, api_key=settings.GOOGLE_API_KEY, temperature=0)
    for answer in answers:
        entry = scores.get(answer["id"])
        if entry is None or entry["answer_clean"] != answer["answer_clean"]:
            entry = {"id": answer["id"], "question": answer["question"],
                     "answer_clean": answer["answer_clean"], "metrics": {}}
            scores[answer["id"]] = entry
        case = test_case(answer)

        for name, metric_class in METRICS.items():
            if name in entry["metrics"]:
                continue
            if name in NEEDS_DOCUMENTS and not case.retrieval_context:
                entry["metrics"][name] = {"score": None, "reason": "The agent didn't search any documents."}
                continue
            print(f"[{answer['id']}] {name} ...", end=" ", flush=True)
            metric = metric_class(model=judge, threshold=PASS_MARK, async_mode=False,
                                  include_reason=True, eval_mode="llm")
            if not measure_with_patience(metric, case):
                print("Saved what's done; run again later to continue.")
                return False
            entry["metrics"][name] = {"score": round(metric.score, 2), "reason": metric.reason}
            save_scores(scores)
            print(round(metric.score, 2))
    return True


def is_refusal(answer: dict) -> bool:
    return answer.get("expect") == "refuse"


def permission_check(answer: dict) -> dict:
    """A "must not answer" question: did search reach the forbidden document, did its facts leak?"""
    parts = [p for p in answer["retrieval_context"] if p["title"] == answer["forbidden_source"]]
    text = answer["answer_clean"].lower()
    phrases = [p for p in answer["forbidden_phrases"] if p.lower() in text]
    return {"passed": not parts and not phrases, "parts": len(parts), "phrases": phrases}


def documents_folder() -> str:
    data = json.loads(QUERIES.read_text(encoding="utf-8"))
    return data["documents"] if isinstance(data, dict) else "plans/documents/test-files"


def _cell(score) -> str:
    if score is None:
        return "–"
    return f"**{score:.2f}**" if score < PASS_MARK else f"{score:.2f}"


def write_report(all_answers: list[dict], scores: dict[int, dict]) -> None:
    names = list(METRICS)
    answers = [a for a in all_answers if not is_refusal(a)]
    refusals = [a for a in all_answers if is_refusal(a)]
    lines = [
        "# Agent evaluation",
        "",
        f"{date.today().isoformat()} · agent `{settings.CHAT_MODEL}` · judge `{JUDGE_MODEL}` "
        f"(DeepEval {deepeval.__version__}) · {len(all_answers)} questions from `{documents_folder()}`, "
        "each asked as a real member of the test org with that person's permissions.",
        "",
        "The judge is the agent's own model (Flash-Lite), because the free tier allows only ~20 Gemini Flash "
        "requests a day; scores may be slightly generous.",
        "",
        f"## Scores (0 to 1, higher is better, pass mark {PASS_MARK}; bold = below it)",
        "",
        "| # | Asked as | Question | " + " | ".join(names) + " |",
        "|---|---|---|" + "---|" * len(names),
    ]
    for answer in answers:
        metrics = scores.get(answer["id"], {}).get("metrics", {})
        row = [_cell(metrics.get(n, {}).get("score")) for n in names]
        lines.append(f"| {answer['id']} | {answer['ask_as']} | {answer['question']} | " + " | ".join(row) + " |")
    averages = []
    for n in names:
        values = [s["metrics"][n]["score"] for s in scores.values()
                  if s["metrics"].get(n, {}).get("score") is not None]
        averages.append(_cell(sum(values) / len(values)) if values else "–")
    lines += ["| | | **Average** | " + " | ".join(averages) + " |", "", "## What each score means", ""]
    lines += [f"- **{n}**: {MEANINGS[n]}" for n in names]
    lines += ["", "None of the five compares the answer with the expected answer: an answer that faithfully "
              "repeats the wrong part of a document still scores 1.00. Check the Answers section below for that."]

    low = [
        (answer["id"], n, m)
        for answer in answers
        for n, m in scores.get(answer["id"], {}).get("metrics", {}).items()
        if m["score"] is not None and m["score"] < PASS_MARK and n != "Context Relevancy"
    ]
    lines += ["", "## Below the pass mark (judge's reason)", ""]
    lines += [f"- **#{i} {n} ({m['score']:.2f})**: {m['reason']}" for i, n, m in low] or ["None."]

    if refusals:
        checks = {a["id"]: permission_check(a) for a in refusals}
        passed = sum(c["passed"] for c in checks.values())
        lines += [
            "",
            f"## Permission checks: {passed}/{len(refusals)} passed",
            "",
            "Questions this person must not get an answer to. Pass = search reached no part of the "
            "forbidden document and the answer contains none of its facts.",
            "",
            "| # | Asked as | Question | Forbidden document | Parts of it found | Its facts in the answer | Result |",
            "|---|---|---|---|---|---|---|",
        ]
        for a in refusals:
            c = checks[a["id"]]
            leaked = ", ".join(f'"{p}"' for p in c["phrases"]) or "none"
            lines.append(f"| {a['id']} | {a['ask_as']} | {a['question']} | `{a['forbidden_source']}` | "
                         f"{c['parts']} | {leaked} | {'PASS' if c['passed'] else '**FAIL**'} |")

    lines += ["", "## Answers", ""]
    for answer in all_answers:
        searches = "; ".join(f'"{s}"' for s in answer["searches"]) or "none"
        found = sorted({part["title"] for part in answer["retrieval_context"]})
        lines += [
            f"### {answer['id']}. {answer['question']}",
            "",
            f"- **Asked as:** {answer['asked_as_user']} ({answer['ask_as']}) · route `{answer['route']}` · "
            f"{answer['seconds']} s",
            f"- **Searched for:** {searches} · rewrites: {answer['rewrites']}",
            f"- **Documents in the results:** {', '.join(found) or 'none'} "
            + (f"(must not include `{answer['forbidden_source']}`)" if is_refusal(answer)
               else f"(should include `{answer['source']}`)"),
            f"- **Expected:** " + (f"no answer. {answer['why']}" if is_refusal(answer) else answer["expected_answer"]),
            f"- **Agent answered:** {answer['answer_clean']}",
            "",
        ]
    REPORT.write_text("\n".join(lines), encoding="utf-8")


def main() -> None:
    if not ANSWERS.exists():
        sys.exit(f"No answers yet. Run evaluation/run_agent.py {QUESTION_SET or ''} first.")
    answers = [a for a in json.loads(ANSWERS.read_text(encoding="utf-8")) if "answer" in a]
    scores = load_scores()
    finished = score_all([a for a in answers if not is_refusal(a)], scores)
    save_scores(scores)
    write_report(answers, scores)
    status = "All scored." if finished else "Partly scored."
    print(f"\n{status} Report: {REPORT.relative_to(EVAL_DIR.parent)}")


if __name__ == "__main__":
    main()
