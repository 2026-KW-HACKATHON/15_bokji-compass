import json
import re
from pathlib import Path

from app.modules.storage.public import validate_draft


def test_published_kwangwoon_draft_seeds_are_importable():
    seed_directory = (
        Path(__file__).resolve().parents[4]
        / "database"
        / "seeds"
        / "kwangwoon_published_policies"
    )
    seed_files = sorted(seed_directory.glob("*.json"))

    assert {path.stem for path in seed_files} == {
        "4515059d908acf6b",
        "f5020b993c490914",
    }
    for path in seed_files:
        draft = validate_draft(json.loads(path.read_text(encoding="utf-8")))
        assert draft["status"] == "needs_review"
        assert draft["source"]["policy_key"] == f"notice:{path.stem}"


def test_sql_seed_contains_all_published_policy_catalog_rows():
    seed = (
        Path(__file__).resolve().parents[4]
        / "database"
        / "seeds"
        / "kwangwoon_published_policies.sql"
    )
    sql = seed.read_text(encoding="utf-8")

    assert sql.startswith("-- Published Kwangwoon policy seed;")
    assert sql.rstrip().endswith("COMMIT;")
    assert {
        table: len(re.findall(rf"INSERT INTO `{table}` ", sql))
        for table in (
            "condition_documents",
            "policy_revision_details",
            "condition_entries",
            "policy_publication_events",
            "policies",
            "policy_requirements",
        )
    } == {
        "condition_documents": 2,
        "policy_revision_details": 2,
        "condition_entries": 27,
        "policy_publication_events": 2,
        "policies": 2,
        "policy_requirements": 8,
    }
