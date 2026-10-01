from pathlib import Path

from app.modules.storage.policy import save_policy_json_file


class FakeCursor:
    lastrowid = 42

    def __init__(self) -> None:
        self.calls = []

    def execute(self, operation: str, parameters: tuple) -> None:
        self.calls.append((operation, parameters))


class FakeConnection:
    def __init__(self) -> None:
        self.cursor_instance = FakeCursor()
        self.committed = False

    def cursor(self) -> FakeCursor:
        return self.cursor_instance

    def commit(self) -> None:
        self.committed = True

    def rollback(self) -> None:
        raise AssertionError("rollback should not be called")


def test_save_policy_json_file_inserts_policy_and_requirements(
    tmp_path: Path,
) -> None:
    path = tmp_path / "policy.json"
    path.write_text(
        '{"서비스ID":"119200000001", "서비스명":"친환경 에너지절감장비 보급", '
        '"소관기관명":"해양수산부", "지원대상":"연근해 허가 어업인"}',
        encoding="utf-8",
    )
    connection = FakeConnection()

    policy_id = save_policy_json_file(path, connection)

    assert policy_id == 42
    assert len(connection.cursor_instance.calls) == 2
    assert connection.cursor_instance.calls[0][1][0] == "친환경 에너지절감장비 보급"
    assert connection.cursor_instance.calls[1][1] == (
        42,
        "other",
        "specified",
        "연근해 허가 어업인",
    )
    assert connection.committed is True