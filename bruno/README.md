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
2. **Bridges / List bridges** — autopobla la variable `bridgeId` que usan los demás requests.
3. El resto en cualquier orden.

## Estructura

```
bruno/
├── bruno.json                 # config de la colección
├── collection.bru             # docs + notas generales
├── environments/
│   ├── Local.bru              # baseUrl http://localhost:3000
│   └── Railway.bru            # baseUrl de producción (ajustar URL)
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
└── Estimates/
    ├── Get estimates (general)
    ├── Get estimates (ready lane)
    ├── Get estimates (sentri)
    ├── Get estimates (pedestrian)
    └── Get estimates (invalid lane - 400)
```

## Variables de entorno

| Variable     | Descripción                                  |
|--------------|----------------------------------------------|
| `baseUrl`    | URL base de la API                           |
| `bridgeId`   | UUID de puente — autopoblado por List bridges |
| `bridgeSlug` | slug de puente — autopoblado por List bridges |
| `laneType`   | general \| ready_lane \| sentri \| pedestrian |

## Notas

- `POST /reports` tiene rate limit de **5 req/min por IP** (429 al pasarse).
- `GET /estimates` cachea en Redis con TTL de 15 min.
- Documentación interactiva (Swagger) en `{{baseUrl}}/api/docs`.
