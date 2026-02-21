# MusicServer

Selbst gehosteter Music Server -- Monorepo mit pnpm Workspaces.

## Projektstruktur

```
/apps
  /server    → Node.js + TypeScript + Express Backend (Prisma ORM)
  /web       → React + TypeScript Frontend (Vite)
/packages
  /shared    → Gemeinsame TypeScript Types
```

## Voraussetzungen

- Node.js >= 20
- pnpm >= 9
- Docker & Docker Compose (für Datenbanken oder Vollbetrieb)

## Setup (Lokale Entwicklung)

### 1. Repository klonen und Dependencies installieren

```bash
git clone <repo-url> && cd musicserver
pnpm install
```

### 2. Umgebungsvariablen konfigurieren

```bash
cp .env.example .env
# .env nach Bedarf anpassen
```

### 3. Datenbanken starten

```bash
docker compose up -d postgres redis
```

### 4. Prisma Migrationen ausführen

```bash
pnpm db:generate
pnpm db:migrate
```

### 5. Entwicklungsserver starten

```bash
# Backend + Frontend parallel
pnpm dev

# Oder einzeln:
pnpm dev:server   # Backend auf :3000
pnpm dev:web      # Frontend auf :5173
```

## Setup (Docker -- Vollbetrieb)

```bash
cp .env.example .env
# SESSION_SECRET in .env auf einen sicheren Wert setzen

docker compose up -d --build
```

Danach erreichbar unter:

- **Frontend:** http://localhost
- **Backend API:** http://localhost:3000/api
- **Health Check:** http://localhost:3000/api/health

## Verfügbare Scripts

| Script | Beschreibung |
|---|---|
| `pnpm dev` | Backend + Frontend parallel starten |
| `pnpm dev:server` | Nur Backend starten |
| `pnpm dev:web` | Nur Frontend starten |
| `pnpm build` | Alle Packages bauen |
| `pnpm lint` | ESLint ausführen |
| `pnpm format` | Prettier formatieren |
| `pnpm db:migrate` | Prisma Migrationen ausführen |
| `pnpm db:generate` | Prisma Client generieren |
| `pnpm db:studio` | Prisma Studio öffnen |

## Technologien

- **Runtime:** Node.js 20
- **Sprache:** TypeScript (strict mode)
- **Backend:** Express
- **Frontend:** React 19, Vite 6
- **Datenbank:** PostgreSQL 16 (Prisma ORM)
- **Cache/Sessions:** Redis 7
- **Monorepo:** pnpm Workspaces
- **Linting:** ESLint + Prettier
- **Container:** Docker + Docker Compose
