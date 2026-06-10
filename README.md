# Portfolio static sites

Static portfolio landing page + sub-sites, published to **two** GitHub Pages surfaces from this one repo:

| Surface | Remote | URL | Audience |
|---|---|---|---|
| Public | `origin` → `Jara-rk1/pages` (personal) | https://jara-rk1.github.io/pages/ | Anyone |
| KPMG-internal | `kpmg` → `kpmg-au-emu/pepi-portfolio` | https://solid-doodle-6qygn66.pages.github.io/ | KPMG GitHub EMU accounts only (SSO sign-in; privately published — EMU Pages cannot be public) |

## Publish flow

1. Edit content, commit on `main`.
2. `git pushall` — pushes both remotes; each Pages site rebuilds automatically on push.

Both surfaces serve the same tree; drift only happens if one push is skipped.

## Credentials

Both accounts live in the `gh` keyring (`Jara-rk1` personal, `jknowles2_kpmg` EMU), but gh's git
credential helper only serves the *active* account — so `git pushall` switches the active account to
`Jara-rk1` for the `origin` push and always switches back to `jknowles2_kpmg` before the `kpmg` push.
If `origin` prompts for a password, the personal account dropped out of the keyring: re-run
`gh auth login -h github.com -p https -w`, sign in as `Jara-rk1`, then
`gh auth switch -h github.com -u jknowles2_kpmg`. (Git Credential Manager is installed but does not
reliably serve stored github.com credentials on this devbox — don't depend on it.)

## Rules

- Never wire KPMG CI/automation to push to `origin` ("Public GitHub" is a prohibited software category at KPMG-AU; the personal surface is maintained manually).
- Only public-appropriate content in this repo — it is world-readable on the public surface.
- Feasibility evidence + ITS asks for wider KPMG-SSO access: `C:\Claude\docs\plans\2026-06-10-github-pages-emu-public-site-feasibility.md` and `C:\Claude\output\2026-06-10-github-pages-sso-gating-asks.md` (not in this repo).
