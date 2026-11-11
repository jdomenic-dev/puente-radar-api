# Consuming the Puente Radar API

Quick reference for clients (mobile app, Bruno, scripts).

- **Base URL (staging):** `https://api.puenteradar.com`
- **Format:** JSON over HTTPS. Send `Content-Type: application/json` on writes.
- **Swagger:** only available in development/test (`/api/docs`), not on staging.

## Authentication

Every route requires the header `x-api-key: <ADMIN_API_KEY>` **except**:

| Route                     | Access                                                                          |
| ------------------------- | ------------------------------------------------------------------------------- |
| `GET /health`             | Public                                                                          |
| `POST /reports`           | Public, limited to 5 requests/min per IP                                        |
| `GET /estimates/overview` | Public (only serves public CBP wait data); result cached for 30 s on the server |

Missing or wrong key returns `401`. Rate limits (`429` when exceeded): 120 requests/min per IP and endpoint (`THROTTLE_LIMIT`), 5 reports/min per IP on `POST /reports`, and Nginx cuts bursts above 10 requests/second per IP before they reach the API (its `429` body is HTML, not JSON). Requests with a wrong key count against the limit too.

> **Never commit the key.** Keep it in a Bruno secret environment variable
> (`apiKey`), a local `.env`, or your CI secret store. The key lives on the server in
> `/home/ec2-user/puente-radar.env` as `ADMIN_API_KEY`.

> **Mobile app warning:** because almost every read endpoint needs the key, an
> `EXPO_PUBLIC_*` value is embedded in the app bundle and can be extracted. Treat the
> current key as a shared service key, not a secret from end users. Before a public
> release, make the read endpoints (`/bridges`, `/estimates`, `/reports` GETs) public
> or add per-device auth, and keep the key only for admin routes.

## Enums

| Enum            | Values                                          |
| --------------- | ----------------------------------------------- |
| `laneType`      | `general`, `ready_lane`, `sentri`, `pedestrian` |
| `lineStatus`    | `pending`, `verified`, `rejected`               |
| bridge `status` | `low`, `medium`, `high`, `saturated`            |
| `trend`         | `rising`, `steady`, `falling`                   |

Seeded bridge slugs: `puente-libre`, `puente-santa-fe`, `puente-zaragoza`,
`puente-guadalupe-tornillo`, `puente-stanton-lerdo`, `puente-santa-teresa`.

## Endpoints

| Method | Path                                        | Auth    | Notes                                                                                                                               |
| ------ | ------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/health`                                   | none    | API and database status                                                                                                             |
| GET    | `/bridges`                                  | api key | All bridges ordered by `sortOrder`                                                                                                  |
| GET    | `/bridges/summary`                          | api key | Bridges with report count of the last 60 min                                                                                        |
| GET    | `/bridges/slug/:slug`                       | api key | `404` if unknown                                                                                                                    |
| GET    | `/bridges/:id`                              | api key | `id` is a UUID                                                                                                                      |
| PATCH  | `/bridges/:id/status`                       | api key | Admin: body `{ status?, waitMinutes?(0-300), trend? }`                                                                              |
| GET    | `/estimates/overview`                       | none    | **Home**: every bridge with all four lanes (pedestrian included) in one call, see below                                             |
| GET    | `/estimates?laneType=general`               | api key | Wait estimates for all bridges (CBP + community + admin adjustment), one lane per call. `laneType` defaults to `general`            |
| GET    | `/historical-patterns`                      | api key | Query `laneType`, `dayOfWeek` (0-6), `time` (`HH:00` or `HH:30`, America/Ciudad_Juarez). `404` unless `HISTORICAL_API_ENABLED=true` |
| POST   | `/reports`                                  | none    | Anonymous report for now (login with Google/Facebook is planned, see `docs/auth-plan.md`), body below                               |
| GET    | `/reports?bridgeId=<uuid>&limit=20`         | api key | `limit` 1-100                                                                                                                       |
| GET    | `/reports/summary/home`                     | api key | Same shape as `/bridges/summary`                                                                                                    |
| GET    | `/reports/bridge/:bridgeId/recent?limit=10` | api key | `404` if the bridge does not exist                                                                                                  |

### `POST /reports` body

```json
{
  "bridgeId": "uuid-of-bridge",
  "laneType": "general",
  "lineStatus": "pending",
  "reportedWaitMinutes": 45,
  "comment": "optional, max 300 chars",
  "anonymousDeviceId": "optional, max 255 chars"
}
```

`bridgeId` and `laneType` are required. `reportedWaitMinutes` is an integer 0-360 and
`comment` at most 300 characters. Get `bridgeId` from `GET /bridges` (ids are generated per
database).

`lineStatus` is **deprecated and ignored**: it is the moderation state of the report, the server
always stores `pending`, and a client can never mark its own report as `verified`. Do not send it.

## Bridge catalog fields

`GET /bridges`, `/bridges/:id` and `/bridges/slug/:slug` return, besides the operational data:

| Field                   | Meaning                                                                                  |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| `shortName`             | Compact name for tight UI ("Santa Teresa"); `null` when not set                          |
| `latitude`, `longitude` | The crossing, for directions; `null` when not set                                        |
| `opensAt`, `closesAt`   | Local opening hours as `"HH:mm"` (`"24:00"` = midnight). **Both `null` = open 24 hours** |

Hours are the ones CBP publishes for each port and coordinates come from OpenStreetMap (both
checked 2026-11-11); verify them before relying on them for anything critical. `/estimates/overview`
already returns `shortName` (falling back to `name`) and a ready-made `schedule.label`.

## `GET /estimates/overview` (Home)

**Public: no `x-api-key`.** The mobile app uses it so the admin key never ships inside the app.

One call replaces `/bridges/summary` plus four `/estimates` calls. Lanes are resolved one after
another on purpose, so a stale CBP cache is refreshed only once per request.

```json
{
  "generatedAt": "2026-11-11T16:05:00.000Z",
  "bridges": [
    {
      "id": "uuid",
      "slug": "puente-santa-teresa",
      "name": "Puente Santa Teresa",
      "shortName": "Santa Teresa",
      "direction": "MX_TO_US",
      "sortOrder": 6,
      "isOpen": true,
      "schedule": { "is24h": false, "label": "6:00 – 22:00" },
      "latitude": 31.78287,
      "longitude": -106.67976,
      "lastUpdatedAt": "2026-11-11T16:00:00.000Z",
      "recentReportCount": 12,
      "lanes": {
        "general": {
          "estimatedWaitMinutes": 12,
          "status": "low",
          "trend": "falling",
          "lanesOpen": 4,
          "available": true,
          "unavailableReason": null,
          "confidence": "high",
          "isBestOption": true,
          "sourceStale": false
        },
        "ready_lane": { "...": "same shape" },
        "sentri": { "...": "same shape" },
        "pedestrian": {
          "estimatedWaitMinutes": null,
          "status": null,
          "trend": null,
          "lanesOpen": 0,
          "available": false,
          "unavailableReason": "laneClosed",
          "confidence": "low",
          "isBestOption": false,
          "sourceStale": false
        }
      }
    }
  ]
}
```

- `direction` is always `MX_TO_US`: CBP only publishes northbound waits.
- `isOpen` is `false` only when every lane is closed.
- A lane without an estimate has `available: false`, `unavailableReason` (`laneClosed` or `noData`)
  and `null` for the wait, status and trend.
- `lanesOpen` is what CBP reports. **There is no `lanesTotal`**: CBP publishes the maximum
  number of lanes per port (vehicles) or per pedestrian area, not per vehicle lane type, so
  "4 of 6" cannot be derived for general/ready/SENTRI. Show "N lanes open".

## Vocabulary the app must follow

| Topic             | Backend value                                                     | Notes                                                                                                                              |
| ----------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Lane types        | `general`, `ready_lane`, `sentri`, `pedestrian`                   | The app uses `REGULAR`, `READY_LANE`, `SENTRI`, `PEDESTRIAN`: map them at the API boundary                                         |
| Trend             | `rising`, `steady`, `falling`                                     | `/estimates` (legacy) says `up`, `stable`, `down`; `/estimates/overview` already uses the first set                                |
| Status thresholds | `low` <= 30 min, `medium` <= 60, `high` <= 120, `saturated` above | Computed by the backend, per lane. The app must **use `status` from the API** instead of deriving it (the prototype used 20/45/90) |

## Examples

```bash
curl https://api.puenteradar.com/health

curl -H "x-api-key: $PUENTE_RADAR_API_KEY" https://api.puenteradar.com/bridges

curl -H "x-api-key: $PUENTE_RADAR_API_KEY" \
  "https://api.puenteradar.com/estimates?laneType=sentri"

curl -X POST https://api.puenteradar.com/reports \
  -H "Content-Type: application/json" \
  -d '{"bridgeId":"<uuid>","laneType":"general","lineStatus":"pending","reportedWaitMinutes":30}'
```

## Mobile app configuration

In `puente-radar-app/.env`:

```
EXPO_PUBLIC_API_URL=https://api.puenteradar.com
EXPO_PUBLIC_APP_ENV=staging
```

## Common errors

| Status | Meaning                                             |
| ------ | --------------------------------------------------- |
| 400    | Validation failed (bad enum, UUID, range, or query) |
| 401    | Missing or invalid `x-api-key`                      |
| 404    | Bridge not found, or historical API disabled        |
| 429    | Rate limit exceeded                                 |
