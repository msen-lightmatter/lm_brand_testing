# Security note: brand-asset download gate

_Last reviewed: 2026-07-08_

This document records how access control works on this site, a confirmed bypass
found during a security review, and the deployment facts you need to keep the
gate effective.

**Status: code fix applied (2026-07-08), nginx step NOT yet deployed.** Gated
bundles have been moved to `protected/` and `download.php` repointed there —
see Remediation below. This site deploys via FTP, not this repo/CI, so the
`protected/` move only takes effect once these files are uploaded, and **the
nginx rule cannot be applied via FTP at all** — see step 2.

## How the gate is supposed to work

- `download.php` is the authoritative access control. It `session_start()`s and
  returns **403** unless `$_SESSION['brand_authed']` is set (established by
  `auth.php`, which is gitignored and validates the shared brand password),
  then `readfile()`s the requested asset from a hardcoded allowlist.
- The password overlay in `downloads.html` / `inference-sans-type-tool.html` is
  **cosmetic UI only**. It is not a security control — the server-side session
  check in `download.php` is.

## Confirmed finding — gate bypass (High)

The gated assets physically live **under the web root** (`assets/logos/`,
`assets/fonts/*.zip`, `assets/documents/*`), so the web server hands them out as
ordinary static files with **no session check**, bypassing `download.php`
entirely.

Verified live at review time (unauthenticated, no session cookie):

| Request | Result |
| --- | --- |
| `GET /brand/download.php?f=lm-product-logos.zip` (the gate) | **403** — correctly denied |
| `GET /brand/assets/logos/lm-product-logos.zip` | **200** — served, no auth |
| `GET /brand/assets/documents/lm-brand-guidelines.pdf` | **200** — served, no auth |
| `GET /brand/assets/documents/lm-brand-skill.md` | **200** — served, no auth |

Impact: all "For internal use only" brand collateral is publicly downloadable by
anyone who knows or guesses the path. (Data is brand assets, not credentials or
PII.)

## Deployment facts that matter (easy to get wrong)

- **Production is nginx** (`nginx/1.18.0`, Ubuntu), fronting PHP-FPM — it is
  **not** Apache.
- **`.htaccess` is dead config here.** nginx never reads `.htaccess`. The rules
  in the repo's `.htaccess` (the `FilesMatch … Require all denied` deny, the
  `X-Robots-Tag`, the crawler blocks) **do nothing in production**. This is why
  even `.md` — which `.htaccess` tries to deny — returned `200`. A couple of
  headers that _do_ appear (`X-Frame-Options`, `X-Content-Type-Options`) and the
  HTTP→HTTPS redirect come from the **nginx** server block, not `.htaccess`.
- Consequence: **any access-control rule must be applied in the nginx server
  block**, not via `.htaccess`. Relocating files inside the repo does not help on
  its own, because nginx serves the whole document root.

## Remediation

1. **Code — done (2026-07-08).** Gated bundles relocated to `protected/`
   (`protected/logos/`, `protected/fonts/`, `protected/documents/`) and
   `download.php`'s allowlist repointed there, so `download.php` is the only
   in-app path to them. `index.html`'s brand-guidelines PDF link was also
   changed from a direct file link to `download.php?f=lm-brand-guidelines.pdf&mode=view`,
   so it now requires the password gate like the rest of the collateral.
   `protected/.htaccess` (`Require all denied`) was added as defense-in-depth
   for any Apache host, though it does nothing on the current nginx prod host.
   **This only takes effect once the updated files are uploaded via FTP** —
   there is no CI/CD deploy from this repo.
2. **Production nginx — NOT yet deployed, required, and FTP cannot do this.**
   The rule lives in `deploy/nginx-brand.conf` in this repo, but that file must
   be manually copied into the actual nginx config path on the server (e.g.
   `/etc/nginx/sites-available/...`) by someone with shell/root access, then
   applied with `nginx -t && systemctl reload nginx`. Add to the `server { … }`
   block serving `/brand`:

   ```nginx
   location ^~ /brand/protected/ {
       internal;   # or `deny all;`
   }
   ```

   `download.php` reads the files with `readfile()` from the filesystem, so this
   deny rule does not break gated downloads.

**The gate is not fixed until step 2 is deployed.** Relocation alone just moves
the exposed path — until the nginx rule is live, `/brand/protected/...` is just
as directly downloadable as `/brand/assets/...` was.

### Verify after deploy

```bash
# gated assets must NOT be directly reachable
curl -I https://lightmatter.co/brand/protected/logos/lm-product-logos.zip   # expect 403/404
curl -I https://lightmatter.co/brand/assets/logos/lm-product-logos.zip      # expect 404 (moved)
# through the gate, with a valid brand session, downloads still work
#   GET /brand/download.php?f=lm-product-logos.zip                          # expect 200
```

## Open items / lower priority

- **Revisited (2026-07-08):** briefly moved the `lightmatter-icons.zip` source
  to a duplicate `protected/icons/`, then reverted — decided not worth the
  two-directories-in-sync maintenance cost. The zip endpoint already requires
  `$_SESSION['brand_authed']` (same check as everything else in
  `download.php`), so the "must be logged in for the bundle" gate was never
  actually broken. Relocating the source directory only hid where the zip
  *reads from*; it didn't reduce exposure, since the same 37 icons are already
  fully public individually (`assets/icons/*.svg`, displayed and downloadable
  from `index.html` by design) and duplicated a second time as inline SVG
  markup in `assets/icon-svg-data.js`. Unlike the logos/fonts/documents
  bundles, icons have no confidentiality to protect — `assets/icons/` remains
  the single source for both the page and the zip.
- ~~The `msenlm.github.io` static mirror has no PHP...~~ **Resolved (2026-07-08):**
  that mirror no longer exists (404, no matching GitHub user/repo) and the
  hostname-based gate bypass for it in `inference-sans-type-tool.html` has been
  removed.
- This repo also has GitHub Pages enabled directly
  (`lightmatter-ai/tml2jas3w`, builds from `main`/root) — confirmed **private**
  (`x-pages-private: 1`, redirects to GitHub SSO), so it is not a public leak of
  `protected/`. But it does mean the gated bundles are pushed to a Pages build on
  every `main` push; if that repo or its Pages visibility is ever made public,
  everything in `protected/` becomes publicly downloadable with no PHP gate at
  all (GitHub Pages doesn't run PHP). Worth deciding whether gated bundles
  should be committed to this repo at all, vs. `.gitignore`d and FTP-only.
