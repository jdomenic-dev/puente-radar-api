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

## Re-check before launch

1. Rotate the admin key. 2. Re-run `pnpm audit --prod`. 3. Review `docs/auth-plan.md` risks (Apple sign-in, account deletion). 4. Confirm the develop environment has Swagger on and production off.
