# Security note: brand-asset download gate

_Last reviewed: 2026-07-08_

This document records how access control works on this site, a confirmed bypass
found during a security review, and the deployment facts you need to keep the
gate effective. **It contains no code — the fix is in a separate PR plus a
production nginx change (see below).**

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

1. **Code (separate PR):** relocate the gated bundles to `protected/` and point
   `download.php` at that directory so `download.php` is the only path to them.
2. **Production nginx (manual, required):** block direct HTTP access to the
   relocated directory. Add to the `server { … }` block serving `/brand` and
   reload (`nginx -t && systemctl reload nginx`):

   ```nginx
   location ^~ /brand/protected/ {
       internal;   # or `deny all;`
   }
   ```

   `download.php` reads the files with `readfile()` from the filesystem, so this
   deny rule does not break gated downloads.

**The gate is not fixed until step 2 is deployed.** Relocation alone just moves
the exposed path.

### Verify after deploy

```bash
# gated assets must NOT be directly reachable
curl -I https://lightmatter.co/brand/protected/logos/lm-product-logos.zip   # expect 403/404
curl -I https://lightmatter.co/brand/assets/logos/lm-product-logos.zip      # expect 404 (moved)
# through the gate, with a valid brand session, downloads still work
#   GET /brand/download.php?f=lm-product-logos.zip                          # expect 200
```

## Open items / lower priority

- `assets/icons/*.svg` (source for the on-the-fly `lightmatter-icons.zip`) are
  also directly reachable. Left as-is for now — display icons, lower
  sensitivity. Gate them too if brand icons are considered restricted.
- The `msenlm.github.io` static mirror has no PHP, so nothing can gate assets
  there; the type-tool page explicitly bypasses the overlay on that host. If any
  gated asset is committed to the repo backing a **public** Pages site, it is
  public there regardless. Keep gated bundles out of any public mirror.
