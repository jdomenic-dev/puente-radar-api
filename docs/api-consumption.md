# Consuming the Puente Radar API

Quick reference for clients (mobile app, Bruno, scripts).

- **Base URL (staging):** `https://api.puenteradar.com`
- **Format:** JSON over HTTPS. Send `Content-Type: application/json` on writes.
- **Swagger:** only available in development/test (`/api/docs`), not on staging.

## Authentication

Every route requires the header `x-api-key: <ADMIN_API_KEY>` **except**:

| Route            | Access                                   |
| ---------------- | ---------------------------------------- |
| `GET /health`    | Public                                   |
| `POST /reports`  | Public, limited to 5 requests/min per IP |

Missing or wrong key returns `401`. Global rate limit is 60 requests/min per IP (`429` when exceeded).

> **Never commit the key.** Keep it in a Bruno secret environment variable
> (`apiKey`), a local `.env`, or your CI secret store. The key lives on the server in
> `/home/ec2-user/puente-radar.env` as `ADMIN_API_KEY`.

> **Mobile app warning:** because almost every read endpoint needs the key, an
> `EXPO_PUBLIC_*` value is embedded in the app bundle and can be extracted. Treat the
> current key as a shared service key, not a secret from end users. Before a public
> release, make the read endpoints (`/bridges`, `/estimates`, `/reports` GETs) public
> or add per-device auth, and keep the key only for admin routes.

## Enums

| Enum         | Values                                           |
| ------------ | ------------------------------------------------ |
| `laneType`   | `general`, `ready_lane`, `sentri`, `pedestrian`  |
| `lineStatus` | `pending`, `verified`, `rejected`                |
| bridge `status` | `low`, `medium`, `high`, `saturated`          |
| `trend`      | `rising`, `steady`, `falling`                    |

Seeded bridge slugs: `puente-libre`, `puente-santa-fe`, `puente-zaragoza`,
`puente-guadalupe-tornillo`, `puente-stanton-lerdo`, `puente-santa-teresa`.

## Endpoints

| Method | Path                              | Auth    | Notes |
| ------ | --------------------------------- | ------- | ----- |
| GET    | `/health`                         | none    | API and database status |
| GET    | `/bridges`                        | api key | All bridges ordered by `sortOrder` |
| GET    | `/bridges/summary`                | api key | Bridges with report count of the last 60 min |
| GET    | `/bridges/slug/:slug`             | api key | `404` if unknown |
| GET    | `/bridges/:id`                    | api key | `id` is a UUID |
| PATCH  | `/bridges/:id/status`             | api key | Admin: body `{ status?, waitMinutes?(0-300), trend? }` |
| GET    | `/estimates?laneType=general`     | api key | Wait estimates for all bridges (CBP + community + admin adjustment). `laneType` defaults to `general` |
| GET    | `/historical-patterns`            | api key | Query `laneType`, `dayOfWeek` (0-6), `time` (`HH:00` or `HH:30`, America/Ciudad_Juarez). `404` unless `HISTORICAL_API_ENABLED=true` |
| POST   | `/reports`                        | none    | Anonymous report, see body below |
| GET    | `/reports?bridgeId=<uuid>&limit=20` | api key | `limit` 1-100 |
| GET    | `/reports/summary/home`           | api key | Same shape as `/bridges/summary` |
| GET    | `/reports/bridge/:bridgeId/recent?limit=10` | api key | `404` if the bridge does not exist |

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

`bridgeId`, `laneType` and `lineStatus` are required. `reportedWaitMinutes` is an
integer 0-360. Get `bridgeId` from `GET /bridges` (ids are generated per database).

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

| Status | Meaning |
| ------ | ------- |
| 400    | Validation failed (bad enum, UUID, range, or query) |
| 401    | Missing or invalid `x-api-key` |
| 404    | Bridge not found, or historical API disabled |
| 429    | Rate limit exceeded |
