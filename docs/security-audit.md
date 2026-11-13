# Security audit (light), 2026-11-11

Scope: the staging API on one EC2 instance behind Nginx. A practical pass, not a pentest.

## What is in place

| Area                         | State                                                                                                                                                                                                      |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Transport                    | HTTPS only (Let's Encrypt), HSTS through Helmet, Nginx version hidden                                                                                                                                      |
| Network                      | Security group opens 80 and 443 only; RDS is not public; Redis has no published port (private Docker network)                                                                                              |
| Auth                         | Everything needs `x-api-key` except `/health`, `POST /reports`, `GET /estimates/overview`; constant-time comparison; key must be 32+ chars in production                                                   |
| Input                        | Global validation (whitelist, reject unknown fields), UUID path ids, `limit` bounded 1 to 100, JSON body limit 50 kb (Nginx 100 kb)                                                                        |
| Rate limit                   | Two layers: Nginx 10 req/s per IP (burst 30), then the API's limiter in Redis (120/min per IP and endpoint, 5/min for reports). The limiter runs before the API-key guard, so wrong keys are throttled too |
| Resilience                   | If Redis is down or slow (> 250 ms) the limiter and the CBP cache fall back to memory/PostgreSQL; no request fails because of Redis                                                                        |
| Abuse of the public overview | Cached 30 s, so a flood costs one computation per 30 s, not one per request                                                                                                                                |
| Container                    | Runs as non-root `node`; Swagger is off in production                                                                                                                                                      |

## Fixed in this pass

- The API-key guard ran before the rate limiter, so a wrong key was never counted. Guard order is now explicit and tested.
- `CbpRedisCache` did not handle a Redis read failure; with Redis enabled that would have meant a 500 on `/estimates`. It now falls back to PostgreSQL.
- `limit` on the recent-reports endpoint had no bounds; ids were not validated as UUIDs (invalid ids reached the database).
- `THROTTLE_REPORTS_LIMIT` was documented but ignored; it is honoured now.
- Dependencies: `body-parser`, `qs`, `proxy-addr`, `multer` and `js-yaml` pinned to patched versions (21 advisories down to 8).
- Nginx now sets `X-Forwarded-For` from the real socket address instead of appending to a client-supplied value.

## Accepted for now

- 8 advisories remain, all in build/CLI tooling (`brace-expansion`, `glob`, `minimatch`, `typeorm` CLI) that is not on the request path.
- One shared admin key; it was pasted into a chat during setup, so **rotate `ADMIN_API_KEY`** (and deactivate the temporary `cli-admin` AWS key) before real users.
- Limits are per IP: users behind one carrier or campus NAT share a budget. Per-user limits arrive with login.
- No WAF or CDN. If real attacks appear, put CloudFront in front of the overview (cached at the edge) before anything heavier.
- Redis has no password; it is reachable only from the API container on the private network.

## Cameras endpoints (2026-11-13)

`GET /cameras` (public), `POST /cameras` and `PATCH /cameras/:id` (admin key).

**Already covered by the global setup:** rate limit runs before the key check and counts wrong keys; the key is compared in constant time; unknown fields are rejected (`whitelist` + `forbidNonWhitelisted`); bodies over 50 kb get 413; ids are validated as UUIDs; Swagger is off in staging and production. Counters are independent per handler (checked on a running API: after 12 wrong-key writes `GET /cameras` still had its full budget).

**Redis: not needed for these endpoints.** The rate-limit counters already live in Redis through the global storage. The list is cached in memory for 60 s, so the database sees one lookup per minute per instance. A Redis cache would add a dependency and a failure mode for no gain until there is more than one API instance.

**Fixed in this pass** (each with a test that failed first):

- `sortOrder` had no maximum and the column is an integer: a huge number reached Postgres and became a 500. Now 0 to 1000, else 400.
- `bridgeSlug` had no length limit; `label` and `description` accepted blanks. Now limited, trimmed, and a blank label is a 400.
- Admin writes now allow 20 per minute per IP (the global limit is 120). Wrong keys count, so guessing the key is slower by a factor of six.
- When the 60 s cache expired, requests arriving together each repeated the lookup. They now share one, a failed lookup is not remembered, and a write that lands during a lookup is never overwritten by it.
- Admin creates and updates leave a log line (camera id, video id or changed field names, never values of the key). There is one shared admin key, so the log says what changed, not who.
- App: the credit link is opened with the system, so the schema accepts only `https://` (rejects `javascript:`, `intent:`, `tel:`).

**Checked on a real API and Postgres:** 400 for oversized `sortOrder`, blank label, 5000-character slug, unknown field, numeric `videoId` and moving a camera to another bridge; 413 for a 70 kb body; 429 on the public list after 30 requests and on admin writes after 20.

**Accepted:**

- The admin limit is per IP and shared by the real key: someone behind the same NAT who floods wrong keys blocks the admin for a minute. The admin writes from known places, so this is acceptable.
- Cameras are cached for 60 s, so a fix made with `PATCH` can take up to a minute to reach every phone (the write itself clears the server cache at once).
- The status of a camera is set by hand until the automatic liveness check exists.

## Re-check before launch

1. Rotate the admin key. 2. Re-run `pnpm audit --prod`. 3. Review `docs/auth-plan.md` risks (Apple sign-in, account deletion). 4. Confirm the develop environment has Swagger on and production off.
