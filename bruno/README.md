# Puente Radar — Colección Bruno

Colección de [Bruno](https://www.usebruno.com/) para probar la API de Puente Radar.

## Abrir la colección

1. Instalá Bruno (https://www.usebruno.com/downloads).
2. **Open Collection** → seleccioná esta carpeta `bruno/`.
3. Elegí el environment **Local** (selector arriba a la derecha).

## Levantar la API primero

Esta colección vive en `backend/puente-radar-api/bruno/`, junto al código de la API.

```bash
cd backend/puente-radar-api    # raíz del backend (un nivel arriba de bruno/)
docker compose up -d           # PostgreSQL :5433 + Redis :6380 (+ RedisInsight :8006)
pnpm seed                      # solo la primera vez — siembra los 6 puentes
pnpm start:dev                 # API en :3000
```

## Orden recomendado

1. **Health / Health check** — confirma que la API responde.
2. Set `apiKey` as a secret environment variable matching `ADMIN_API_KEY`.
3. **Bridges / List bridges** — autopobla la variable `bridgeId` que usan los demás requests.
4. El resto en cualquier orden.

## Estructura

```
bruno/
├── bruno.json                 # config de la colección
├── collection.bru             # docs + notas generales
├── environments/
│   ├── Local.bru              # baseUrl http://localhost:3000
│   └── Staging.bru            # baseUrl https://api.puenteradar.com
├── Health/
│   └── Health check
├── Bridges/
│   ├── List bridges           # ← corré este primero (setea bridgeId)
│   ├── Bridges summary
│   ├── Get bridge by slug
│   ├── Get bridge by id
│   └── Update bridge status
├── Reports/
│   ├── Create report
│   ├── List reports
│   ├── Home summary
│   ├── Recent by bridge
│   └── Rate limit test (429)
├── Estimates/
│   ├── Get estimates (general)
│   ├── Get estimates (ready lane)
│   ├── Get estimates (sentri)
│   ├── Get estimates (pedestrian)
│   └── Get estimates (invalid lane - 400)
└── Historical patterns/
    ├── Get historical patterns
    └── Get historical patterns (invalid query - 400)
```

## Variables de entorno

| Variable     | Descripción                                  |
|--------------|----------------------------------------------|
| `baseUrl`    | URL base de la API                           |
| `bridgeId`   | UUID de puente — autopoblado por List bridges |
| `bridgeSlug` | slug de puente — autopoblado por List bridges |
| `laneType`   | general \| ready_lane \| sentri \| pedestrian |
| `apiKey`     | Secret value sent as `x-api-key` on protected requests |

## Notas

- `POST /reports` tiene rate limit de **5 req/min por IP** (429 al pasarse).
- Only `GET /health` and `POST /reports` are public. Every other API request requires `x-api-key`.
- `GET /estimates` cachea en Redis con TTL de 15 min.
- `GET /historical-patterns` devuelve **404** a menos que `HISTORICAL_API_ENABLED=true`.
  Para ver distribución en lugar de `insufficientData`, activá `HISTORICAL_COLLECTION_ENABLED=true`
  y esperá varias corridas (mínimo 6 fechas locales y 70% de cobertura).
- Swagger is available at `{{baseUrl}}/api/docs` only in development and test; use **Authorize** to set `x-api-key`.
