"""Old request identities cannot restore stored private data after withdrawal."""

import time
from concurrent.futures import ThreadPoolExecutor
from threading import Event

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine, event, insert, select, update

from app.contracts.finance import FinancialProfile
from app.core.config import Settings
from app.modules.auth.account_write import require_active_account
from app.modules.auth.models import accounts, sessions
from app.modules.auth.schema import initialize_auth_schema
from app.modules.auth.service import AuthService
from app.modules.finance import storage as finance
from app.modules.finance.schema import initialize_finance_schema
from app.modules.notifications import storage as notifications
from app.modules.notifications.models import DeviceInput, Preferences

ACCOUNT = "withdrawing-member"
WEB_TOKEN = "W" * 43
MOBILE_TOKEN = "M" * 43


@pytest.fixture
def stores(tmp_path):
    engine = create_engine(
        "sqlite:///" + (tmp_path / "write-guards.sqlite3").as_posix(),
        connect_args={"check_same_thread": False, "timeout": 5},
    )
    initialize_auth_schema(engine)
    initialize_finance_schema(engine)
    notifications.initialize_notification_schema(engine)
    service = AuthService(engine, Settings(_env_file=None, app_env="test"))
    with engine.begin() as connection:
        connection.execute(
            insert(accounts).values(
                id=ACCOUNT,
                username="guard_test",
                password_hash="unused",
                gender="undisclosed",
                created_at=1,
            )
        )
        for token, mobile in ((WEB_TOKEN, False), (MOBILE_TOKEN, True)):
            connection.execute(
                insert(sessions).values(
                    token_hash=service.session_digest(token, mobile=mobile),
                    account_id=ACCOUNT,
                    expires_at=int(time.time()) + 3600,
                )
            )
    yield service, finance.FinancialProfileStore(engine), notifications.NotificationStore(engine)
    engine.dispose()


def save_request(stores, kind):
    service, financial, notice = stores
    if kind == "finance":
        return lambda: financial.save(ACCOUNT, FinancialProfile(members=[{}]))
    if kind == "preferences":
        return lambda: notice.save(ACCOUNT, Preferences(enabled=True))
    return lambda: notice.register(
        ACCOUNT,
        service.session_digest(MOBILE_TOKEN, mobile=True),
        DeviceInput(push_token="ExpoPushToken[withdrawal-write-guard]", platform="android"),
    )


def assert_no_private_rows(engine):
    with engine.connect() as connection:
        for table in (
            accounts,
            finance.financial_profiles,
            notifications.preferences,
            notifications.devices,
        ):
            assert connection.execute(select(table)).first() is None


@pytest.mark.parametrize("kind", ["finance", "preferences", "device"])
def test_authenticated_request_held_until_after_withdrawal_cannot_restore_data(stores, kind):
    # Capture the member/store as a request dependency would, then finish withdrawal.
    request = save_request(stores, kind)
    service = stores[0]
    service.withdraw(WEB_TOKEN)
    with pytest.raises(HTTPException) as rejected:
        request()
    assert rejected.value.status_code == 401
    assert_no_private_rows(service.engine)


@pytest.mark.parametrize("kind", ["finance", "preferences", "device"])
def test_started_write_serializes_with_withdrawal_and_its_rows_are_deleted(
    stores,
    kind,
    monkeypatch,
):
    active, release, withdrawal_started = Event(), Event(), Event()
    module = finance if kind == "finance" else notifications

    def hold_account_lock(connection, account_id):
        account = require_active_account(connection, account_id)
        active.set()
        assert release.wait(5), "test did not release the account write lock"
        return account

    monkeypatch.setattr(module, "require_active_account", hold_account_lock)
    service = stores[0]

    def withdraw():
        withdrawal_started.set()
        service.withdraw(WEB_TOKEN)

    with ThreadPoolExecutor(max_workers=2) as executor:
        writing = executor.submit(save_request(stores, kind))
        assert active.wait(5), "private write did not acquire the account lock"
        withdrawing = executor.submit(withdraw)
        assert withdrawal_started.wait(5), "withdrawal was not dispatched"
        assert not withdrawing.done(), "withdrawal must wait for the private write transaction"
        release.set()
        writing.result(timeout=5)
        withdrawing.result(timeout=5)
    assert_no_private_rows(service.engine)


@pytest.mark.parametrize("kind", ["finance", "preferences", "device"])
def test_write_waiting_for_active_withdrawal_rechecks_deleted_member(stores, kind):
    service = stores[0]
    deleting, release, write_started = Event(), Event(), Event()

    def hold_deletion(connection, cursor, statement, parameters, context, executemany):
        if "DELETE FROM auth_accounts" in statement:
            deleting.set()
            assert release.wait(5), "test did not release the withdrawal transaction"

    def late_write():
        write_started.set()
        save_request(stores, kind)()

    event.listen(service.engine, "before_cursor_execute", hold_deletion)
    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            withdrawing = executor.submit(service.withdraw, WEB_TOKEN)
            assert deleting.wait(5), "withdrawal did not acquire its account write lock"
            writing = executor.submit(late_write)
            try:
                assert write_started.wait(5), "old authenticated write was not dispatched"
                assert not writing.done(), "private write must wait for withdrawal"
            finally:
                release.set()
            withdrawing.result(timeout=5)
            with pytest.raises(HTTPException) as rejected:
                writing.result(timeout=5)
            assert rejected.value.status_code == 401
    finally:
        release.set()
        event.remove(service.engine, "before_cursor_execute", hold_deletion)
    assert_no_private_rows(service.engine)


@pytest.mark.parametrize("change", [{"expires_at": 0}, {"account_id": "different-member"}])
def test_device_enrollment_rechecks_its_own_live_session_inside_write_transaction(stores, change):
    service = stores[0]
    with service.engine.begin() as connection:
        connection.execute(
            update(sessions)
            .where(sessions.c.token_hash == service.session_digest(MOBILE_TOKEN, mobile=True))
            .values(**change)
        )
    with pytest.raises(HTTPException) as rejected:
        save_request(stores, "device")()
    assert rejected.value.status_code == 401
    with service.engine.connect() as connection:
        assert connection.execute(select(notifications.devices)).first() is None
