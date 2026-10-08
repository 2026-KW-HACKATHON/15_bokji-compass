"""Catalog monitoring also runs independently of browsers, sessions and HTTP processes."""

import logging
from collections.abc import Callable
from functools import partial

from fastapi import HTTPException
from sqlalchemy import select

from app.modules.auth.models import accounts
from app.modules.monitoring.models import MonitoringProfile
from app.modules.monitoring.public import derive_needs, scan_candidates

logger = logging.getLogger(__name__)


def load_member(auth_service, account_id):
    """Load the account from server storage; a live login session is not required."""
    with auth_service.engine.connect() as connection:
        row = connection.execute(select(accounts).where(accounts.c.id == account_id))\
            .mappings().first()
    if row is None:
        raise HTTPException(401, "로그인이 필요해요.")
    return auth_service.public_account(row)


def evaluate_account(repository, store, member, *, today=None):
    snapshot = store.read(member["id"])
    if not snapshot["enabled"] or snapshot["profile"] is None:
        return snapshot
    # Request dependencies or other worker stages may have captured an older member profile.
    with store.engine.connect() as connection:
        fresh = connection.execute(select(accounts.c.id, accounts.c.age, accounts.c.gender,
                                          accounts.c.region).where(
            accounts.c.id == member["id"]
        )).mappings().first()
    if fresh is None:
        raise HTTPException(401, "로그인이 필요해요.")
    member = dict(fresh)
    profile = MonitoringProfile.model_validate(snapshot["profile"])
    needs = derive_needs(member, profile, today=today)
    found = scan_candidates(repository, member, profile, needs, today=today)
    return store.record_scan(member["id"], needs, found, expected_version=snapshot["version"],
                             expected_member=member)


def run_once(repository, store, auth_service=None, *, member_loader: Callable | None = None,
             batch_size=100, today=None):
    """Continue after account-local failures, without logging personal facts or exception text."""
    if member_loader is None:
        if auth_service is None:
            raise ValueError("Provide an auth_service or member_loader")
        member_loader = partial(load_member, auth_service)
    result = {"checked": 0, "skipped": 0, "failed": 0}
    for account_id in store.enabled_accounts(batch_size=batch_size):
        try:
            member = member_loader(account_id)
            if member["id"] != account_id:
                raise ValueError("Member loader returned a different account")
            before = store.read(account_id)
            if not before["enabled"]:
                result["skipped"] += 1
                continue
            after = evaluate_account(repository, store, member, today=today)
            result["checked" if (after["last_checked_at"] is not None
                                  and after["last_checked_at"] != before["last_checked_at"])
                   else "skipped"] += 1
        except HTTPException as exc:
            if exc.status_code == 401:
                result["skipped"] += 1
            else:
                result["failed"] += 1
                logger.warning("Monitoring account evaluation failed (%s)", type(exc).__name__)
        except Exception as exc:
            result["failed"] += 1
            logger.warning("Monitoring account evaluation failed (%s)", type(exc).__name__)
    return result
