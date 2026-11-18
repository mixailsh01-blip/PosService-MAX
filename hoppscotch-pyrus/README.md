# Hoppscotch with Pyrus login

Fork-by-patch of Hoppscotch Community Edition (MIT):

- Backend: magic-link sign-in and token refresh are allowed only for e-mails of
  Pyrus organization members (not banned). List refreshes every 10 minutes.
  Enabled when `PYRUS_LOGIN` and `PYRUS_SECURITY_KEY` are set
  (`PYRUS_EXTRA_ALLOWED` – comma-separated extra e-mails, e.g. the admin).
- Frontend: guest mode is removed – the main layout shows a non-dismissable
  login window until the user is signed in.

The GitHub Action builds the `aio` image from upstream + `pyrus-login.patch`
and pushes `ghcr.io/<owner>/hoppscotch-pyrus:latest`.
To update upstream: change `UPSTREAM_SHA`, re-make the patch, push.

## SPRT transport policy

The self-hosted web client exposes only Proxy and coerces every persisted or
synchronized interceptor selection to `proxy`. Browser, Agent and Extension are
not selectable; Agent/Extension services are not registered. The fixed same-origin
iiko gateway retains a private transport (not a user mode) so existing iiko routes
keep working. Arbitrary external targets use the Proxy interceptor.

The learning access gate loads current progress from the SQLite-backed `/sprt/me`,
merges eligible legacy progress through `/sprt/recover`, and updates the parent
shell after acknowledged changes. PostgreSQL training flags are no longer the
authority. Failed reads do not unlock access or overwrite the saved browser cache.

Feature-branch builds publish immutable commit tags, leaving `latest` unchanged.
After the build succeeds, install its exact SHA image on the server:

```bash
sudo bash deploy/update-client.sh ghcr.io/mixailsh01-blip/hoppscotch-pyrus:<full-commit-sha>
```

This preserves all existing Compose overlays (domain/TLS, auth hotpatch and
training bind mount). It changes only the Hoppscotch image; the SQLite service and
volume remain in place. A rollback script pins the previously running local image.

Policy checks against the patched upstream tree:

```bash
HOPPSCOTCH_SOURCE=/path/to/patched/upstream node --test hoppscotch-pyrus/policy.test.mjs
```
