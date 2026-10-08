from pathlib import Path

from app.modules.normalization.raw import load_raw_policies


def test_kwangwoon_seed_is_standard_pipeline_input():
    seed = Path(__file__).resolve().parents[4] / "database" / "seeds" / "kwangwoon_notices.json"
    policies = load_raw_policies(seed)

    assert len(policies) == 190
    assert len({policy.policy_key for policy in policies}) == len(policies)
    assert all(policy.policy_key.startswith("notice:") for policy in policies)
    assert all(policy.organization == "광운대학교" for policy in policies)
    assert all(policy.source_url and "DUID=" in policy.source_url for policy in policies)
    assert all(policy.fields.get("text") for policy in policies)
