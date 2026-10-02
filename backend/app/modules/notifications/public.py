"""Event producers use this boundary; no client API can send arbitrary pushes."""

from app.modules.notifications.models import NotificationEvent
from app.modules.notifications.storage import NotificationStore


def build_messages(store: NotificationStore, event: NotificationEvent) -> list[dict]:
    """Build opted-in Expo payloads for live sessions; does not send or infer eligibility.

    Producers must validate recipients; delivery workers must handle deduplication,
    retries and Expo tickets/receipts before production use.
    """
    settings = store.read(event.account_id)
    if not settings.enabled or not getattr(settings, event.category):
        return []
    return [{
        "to": token, "title": event.title, "body": event.body,
        "sound": "default", "channelId": event.category,
        "data": {"category": event.category, "policy_id": event.policy_id},
    } for token in store.destinations(event.account_id)]
