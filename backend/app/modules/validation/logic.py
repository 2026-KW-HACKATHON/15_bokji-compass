"""Three-valued logic for already evaluated leaves; not a policy recommendation API."""

from typing import Literal

from app.contracts.conditions import LogicNode

Verdict = Literal["PASS", "FAIL", "UNKNOWN"]


def evaluate_logic(node: LogicNode, outcomes: dict[str, Verdict]) -> Verdict:
    if any(value not in {"PASS", "FAIL", "UNKNOWN"} for value in outcomes.values()):
        raise ValueError("Invalid condition verdict")
    if node.op == "unknown":
        return "UNKNOWN"
    if node.op == "condition":
        return outcomes.get(node.condition_id, "UNKNOWN")
    values = [evaluate_logic(child, outcomes) for child in node.children]
    if node.op == "not":
        return {"PASS": "FAIL", "FAIL": "PASS", "UNKNOWN": "UNKNOWN"}[values[0]]
    if node.op == "all":
        return "FAIL" if "FAIL" in values else "PASS" if all(
            v == "PASS" for v in values) else "UNKNOWN"
    return "PASS" if "PASS" in values else "FAIL" if all(
        v == "FAIL" for v in values) else "UNKNOWN"
