"""Cognito Pre-Sign-Up trigger.

Enforces an email allowlist for federated (Google) sign-ups. Any email that is
not on ALLOWED_EMAILS is rejected before a user record is created, so the wine
tracker stays private to known club members even though Google federation would
otherwise authenticate any Google account.

Fails closed: an empty or missing allowlist rejects everyone.
"""

import os


def _allowed_emails():
    raw = os.environ.get("ALLOWED_EMAILS", "")
    return {entry.strip().lower() for entry in raw.split(",") if entry.strip()}


def handler(event, _context):
    attributes = event.get("request", {}).get("userAttributes", {}) or {}
    email = (attributes.get("email") or "").strip().lower()

    allowlist = _allowed_emails()
    if not email or email not in allowlist:
        # Raising here surfaces to the Hosted UI as a sign-in error and blocks
        # user creation. Keep the message generic to avoid leaking the allowlist.
        raise Exception("Your account is not authorized to access this application.")

    # Trust Google's verified email and skip the confirmation step. These flags
    # are honored for the standard sign-up sources; they are harmless no-ops for
    # PreSignUp_ExternalProvider.
    event["response"]["autoConfirmUser"] = True
    event["response"]["autoVerifyEmail"] = True

    return event
