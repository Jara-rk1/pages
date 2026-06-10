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

Both remotes authenticate via `gh` multi-account (`!gh auth git-credential`, URL-scoped in `.git/config`):
`origin` as `Jara-rk1` (personal), `kpmg` as `jknowles2_kpmg` (EMU). If `origin` prompts for a password,
the personal account is missing from `gh`: run `gh auth login -h github.com -p https -w`, sign in as
`Jara-rk1`, then `gh auth switch -h github.com -u jknowles2_kpmg` to keep the EMU account active for API use.

## Rules

- Never wire KPMG CI/automation to push to `origin` ("Public GitHub" is a prohibited software category at KPMG-AU; the personal surface is maintained manually).
- Only public-appropriate content in this repo — it is world-readable on the public surface.
- Feasibility evidence + ITS asks for wider KPMG-SSO access: `C:\Claude\docs\plans\2026-06-10-github-pages-emu-public-site-feasibility.md` and `C:\Claude\output\2026-06-10-github-pages-sso-gating-asks.md` (not in this repo).
