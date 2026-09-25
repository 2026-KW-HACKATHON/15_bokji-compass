"""Inspect deterministic condition extraction without calling an LLM or database."""

import argparse
import json
from pathlib import Path

from app.modules.normalization.conditions import normalize_conditions
from app.modules.normalization.raw import load_raw_policies
from app.modules.parsers.conditions import RULE_VERSION, extract_conditions


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, action="append", required=True)
    args = parser.parse_args()
    rows = []
    for path in args.input:
        for source in load_raw_policies(path):
            result = extract_conditions(source)
            canonical = normalize_conditions(result.extraction, logic=result.logic) \
                if result.extraction else None
            rows.append({"policy_key": source.policy_key, "title": source.title,
                         "requires_llm": not (result.complete and canonical
                                              and canonical.coverage == "complete"),
                         "unresolved_fields": result.unresolved_fields,
                         "code_condition_count": len(result.extraction.conditions)
                         if result.extraction else 0,
                         "canonical": canonical.model_dump() if canonical else None})
    print(json.dumps({"rule_version": RULE_VERSION, "records": rows},
                     ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
