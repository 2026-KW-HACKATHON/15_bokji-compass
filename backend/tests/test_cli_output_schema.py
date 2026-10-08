"""CLI schemas require nullable keys while stored models retain optional defaults."""

import json
from copy import deepcopy
from pathlib import Path

import pytest

from app.contracts.parsing import PolicyExtraction, PolicyOverview
from app.core.config import Settings
from app.modules.llm import public as llm
from app.modules.schedules.public import PeriodExtraction
from tests.test_raw_parsing import overview
from tests.test_schedule_repairs import missing


def schema_nodes(value):
    if isinstance(value, dict):
        yield value
        for child in value.values():
            yield from schema_nodes(child)
    elif isinstance(value, list):
        for child in value:
            yield from schema_nodes(child)


@pytest.mark.parametrize("model", [
    PolicyOverview, PeriodExtraction, PolicyExtraction, llm.BatchResponse,
])
def test_cli_schema_requires_all_nested_properties_without_changing_stored_model(model):
    schema = model.model_json_schema()
    original = deepcopy(schema)
    cli_schema = llm.strict_output_schema(schema)
    objects = [node for node in schema_nodes(cli_schema)
               if node.get("type") == "object" and "properties" in node]
    assert objects
    for node in objects:
        assert set(node["required"]) == set(node["properties"])
        assert node["additionalProperties"] is False
    assert all("default" not in node for node in schema_nodes(cli_schema))
    assert schema == original
    assert model.model_json_schema() == original
    if model in (PolicyOverview, PeriodExtraction):
        assert schema["properties"]["calendar_expression"]["default"] is None
        assert "calendar_expression" not in schema["required"]
        assert "calendar_expression" in cli_schema["required"]
        choices = cli_schema["properties"]["calendar_expression"]["anyOf"]
        assert {choice["type"] for choice in choices} == {"string", "null"}


def test_schema_recurses_through_definitions_unions_and_array_items_and_keeps_constraints():
    nested = {"type": "object", "additionalProperties": False,
              "properties": {"optional": {"type": "integer", "minimum": 1, "default": 5}}}
    schema = {"type": "object", "additionalProperties": False, "properties": {
        "items": {"type": "array", "minItems": 2, "maxItems": 4, "items": {
            "anyOf": [{"$ref": "#/$defs/Nested"}, {"type": "null"}],
        }},
        "alternative": {"oneOf": [deepcopy(nested), {"type": "string", "enum": ["allowed"]}]},
    }, "$defs": {"Nested": nested}}
    original = deepcopy(schema)
    cli_schema = llm.strict_output_schema(schema)
    assert cli_schema["required"] == ["items", "alternative"]
    assert cli_schema["$defs"]["Nested"]["required"] == ["optional"]
    assert cli_schema["properties"]["alternative"]["oneOf"][0]["required"] == ["optional"]
    assert cli_schema["$defs"]["Nested"]["properties"]["optional"] == {
        "type": "integer", "minimum": 1,
    }
    assert cli_schema["properties"]["items"]["minItems"] == 2
    assert cli_schema["properties"]["items"]["maxItems"] == 4
    assert cli_schema["properties"]["items"]["items"]["anyOf"] == [
        {"$ref": "#/$defs/Nested"}, {"type": "null"},
    ]
    assert schema == original


@pytest.mark.parametrize("response", [overview(), missing()])
def test_structured_cli_writes_required_nullable_schema_and_accepts_null_response(
    tmp_path, monkeypatch, response,
):
    model = type(response)
    output_schema = model.model_json_schema()
    original = deepcopy(output_schema)
    monkeypatch.setattr(llm, "resolve_codex_executable", lambda _: tmp_path / "codex.exe")
    captured = {}

    class FakeProcess:
        returncode = 0

        def __init__(self, args, **kwargs):
            captured["schema"] = json.loads(Path(args[args.index("--output-schema") + 1]).read_text(
                encoding="utf-8",
            ))
            Path(args[args.index("-o") + 1]).write_text(
                response.model_dump_json(), encoding="utf-8",
            )
            kwargs["stdout"].write(b'{"type":"turn.completed","usage":{}}\n')

        def communicate(self, prompt, timeout):
            assert b"calendar_expression" not in prompt

    monkeypatch.setattr(llm.subprocess, "Popen", FakeProcess)
    parsed, _metadata = llm._extract_structured(
        None, Settings(_env_file=None), tmp_path / "attempt", "gpt-5.6-luna",
        "Return JSON", model, "test-schema", payload={}, output_schema=output_schema,
    )
    assert "calendar_expression" in captured["schema"]["required"]
    assert "default" not in captured["schema"]["properties"]["calendar_expression"]
    assert parsed.calendar_expression is None
    assert parsed == response
    assert output_schema == original
    legacy = response.model_dump()
    legacy.pop("calendar_expression")
    assert model.model_validate(legacy).calendar_expression is None
