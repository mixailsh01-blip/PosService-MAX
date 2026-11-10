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
