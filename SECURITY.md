# Security Policy

## Supported versions

This project is pre-1.0. Only the latest tagged release receives
security fixes.

| Version  | Supported |
| -------- | --------- |
| 0.1.x    | ✅        |
| < 0.1    | ❌        |

## Reporting a vulnerability

If you believe you've found a security issue, **please do not open a
public GitHub issue**.

Instead, open a private security advisory on this repository:

1. Go to the **Security** tab of the repo.
2. Click **Report a vulnerability**.
3. Fill in the form with as much detail as you can.

Alternatively, you can open an issue asking for a private contact
channel without disclosing the vulnerability details.

## What we consider in scope

- Any code path in the extension that would cause data to leave the
  user's device.
- Any path that reads authentication state (cookies, storage tokens,
  headers) from the host site.
- Cross-site scripting or content-injection via export files or the
  popup / options pages.
- Permission-escalation paths in the Chrome extension itself.

## What we do not consider in scope

- Bugs in Chrome itself, or in the host sites (Facebook / Messenger).
- Denial-of-service against the host site caused by the user scrolling
  through their own conversation.
- Issues that require an attacker to already have access to the user's
  machine or Chrome profile.

## Response target

We aim to acknowledge reports within **5 business days** and to publish
a fix or mitigation within **30 days** of confirmation.

Thank you for helping keep users safe.
