# Familienapp

Familien-Organisation (Aufgaben, Punkte, Belohnungen) als installierbare PWA mit
selbst gehostetem Convex-Backend. Maßgeblich für Scope, Datenmodell und Phasen ist
[`.docs/PLAN.md`](.docs/PLAN.md); das bindende Schnittstellen-Contract für Backend
und Wall-Dashboard ist [`.docs/FAMILY_APP.md`](.docs/FAMILY_APP.md).

## Voraussetzungen

- Node.js 22+
- pnpm (`corepack enable` oder `npm i -g pnpm`)
- Docker (für das lokale Convex-Backend)

## Entwicklung

```sh
# 1. Lokales Convex-Backend + Dashboard starten
docker compose up -d

# 2. Admin-Key erzeugen (einmalig, danach in .env.local eintragen)
docker compose exec -T backend ./generate_admin_key.sh

# 3. .env.local aus der Vorlage anlegen und ausfüllen
cp .env.example .env.local
#   CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3210
#   CONVEX_SELF_HOSTED_ADMIN_KEY=<Key aus Schritt 2>

# 4. Abhängigkeiten installieren
pnpm install

# 5. Convex-Funktionen im Watch-Modus deployen (eigenes Terminal)
npx convex dev

# 6. Frontend starten
pnpm dev
```

Lokale Endpunkte:

| Dienst            | URL                     |
| ----------------- | ----------------------- |
| Frontend (Vite)   | http://localhost:5173   |
| Convex API        | http://127.0.0.1:3210   |
| Convex HTTP-Actions | http://127.0.0.1:3211 |
| Convex Dashboard  | http://127.0.0.1:6791   |

## Verifikations-Gates

Vor jedem Commit bzw. Abschluss einer Aufgabe müssen diese Befehle fehlerfrei
durchlaufen:

```sh
pnpm typecheck
pnpm lint
pnpm build
npx convex dev --once
```

`pnpm build` erzeugt zusätzlich den Service Worker (`dist/sw.js`), das Manifest
(`dist/manifest.webmanifest`) sowie die PWA-Icons. Falls sich die Platzhalter-Icons
ändern sollen:

```sh
node scripts/generate-icons.mjs
```

## Deploy (Coolify)

### Frontend

Das `Dockerfile` baut die SPA in einer `node:22-alpine`-Stufe und liefert sie
über `nginx:alpine` aus (`nginx.conf`). Der Convex-Endpunkt wird zur **Build-Zeit**
in das Bundle gebacken:

> ⚠️ `VITE_CONVEX_URL` muss in Coolify als **Build-Arg** gesetzt werden, **nicht**
> als Runtime-Environment-Variable. Runtime-Envs erreichen das gebaute SPA nicht.

```text
VITE_CONVEX_URL=https://familybackend.matthias.lol
```

Lokaler Test des Images:

> ⚠️ Ohne `--build-arg` backt das Dockerfile den **Prod**-Endpoint
> `https://familybackend.matthias.lol` ins Bundle (Default). Für einen lokalen
> Test daher explizit auf das Dev-Backend zeigen:

```sh
docker build --build-arg VITE_CONVEX_URL=http://127.0.0.1:3210 -t familienapp .
docker run --rm -p 8080:80 familienapp
```

### Convex

- Coolify-Convex-Template mit den drei Domains:
  `familybackend.matthias.lol` → Backend (3210),
  `familybackend-http.matthias.lol` → Site/HTTP-Actions (3211),
  `familybackend-dash.matthias.lol` → Dashboard.
- Backend-Env in Coolify:
  `CONVEX_CLOUD_ORIGIN=https://familybackend.matthias.lol`,
  `CONVEX_SITE_ORIGIN=https://familybackend-http.matthias.lol`.
- Funktionen deployen:

  ```sh
  CONVEX_SELF_HOSTED_URL=https://familybackend.matthias.lol \
  CONVEX_SELF_HOSTED_ADMIN_KEY=<Prod-Admin-Key> \
  npx convex deploy
  ```

- Das Dashboard-Domain schützen (Coolify Basic Auth oder nur via VPN erreichbar).
- Prod-Env-Variablen in Convex setzen (via `npx convex env set`):
  `PIN_*` (PINs der Familienmitglieder), `DASHBOARD_TOKEN`, `INGEST_TOKEN`,
  plus für Web Push: `VAPID_PUBLIC_KEY` und `VAPID_PRIVATE_KEY` (Schlüsselpaar
  einmalig generieren mit `pnpm dlx web-push generate-vapid-keys`; lokal und
  in Prod dürfen verschiedene Paare verwendet werden) und optional
  `VAPID_SUBJECT` (Kontakt-URL, Default `mailto:familienapp@matthias.lol`).
  Für das Eltern-Briefing auf der Übersicht: `GEMINI_API_KEY` (Pflicht) und
  optional `GEMINI_MODEL` (Default `gemini-3.8-flash`). Das Briefing wird
  automatisch um 6 und 16 Uhr (Berlin) erstellt und kann von den Eltern
  jederzeit neu erzeugt werden (max. 20× pro Tag).
  Hinweis: iOS liefert Web Push erst ab iOS 16.4 und nur, wenn die PWA auf
  dem Homescreen installiert ist.

### Secrets

`.env.local` ist gitignored und enthält den lokalen Admin-Key — niemals committen.
Produktions-Secrets (Admin-Key, PINs, Tokens) liegen ausschließlich in Coolify bzw.
in den Convex-Env-Variablen.
