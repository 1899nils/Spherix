# Spherix 🎵

Spherix ist ein moderner, selbst gehosteter Musik-Server, der eine nahtlose Erfahrung für deine private Musiksammlung bietet. Das Projekt ist als Monorepo mit pnpm Workspaces strukturiert und darauf optimiert, einfach bereitgestellt zu werden.

## ✨ Features

- **Intuitive Benutzeroberfläche:** Modernes Design mit Fokus auf Ästhetik und Benutzerfreundlichkeit.
- **Intelligenter Scanner:** Extrahiert Metadaten (Titel, Album, Jahr, Cover) zuverlässig aus deiner Musiksammlung (MP3, FLAC, OGG, etc.).
- **Radio-Integration:** Live-Radiosender direkt im Browser hören, mit filterbaren Regionen (z.B. Hessen, Bayern, NRW).
- **Zuletzt hinzugefügt:** Behalte den Überblick über deine neuesten Entdeckungen.
- **All-in-One Docker Image:** Einfache Bereitstellung aller Komponenten in einem einzigen Container.
- **Subsonic API:** Kompatibilität mit vielen mobilen Subsonic-Clients.

## 🚀 Schnelle Bereitstellung (Docker)

Spherix kann einfach als Docker-Container gestartet werden. Das Image enthält bereits den Server, das Frontend, PostgreSQL und Redis.

```bash
docker run -d \
  --name spherix \
  -p 80:80 \
  -v /pfad/zu/deiner/musik:/music \
  -v spherix_data:/data \
  -e SESSION_SECRET=dein_sicheres_geheimnis \
  --device /dev/dri \
  ghcr.io/1899nils/spherix:latest
```

Alternativ kannst du das Projekt über **Docker Compose** starten:

```bash
docker compose up -d --build
```

- **Frontend:** [http://localhost](http://localhost)
- **Backend API:** [http://localhost:3000/api](http://localhost:3000/api)

### ⚡ Hardware-Transkodierung

Videos werden möglichst **direkt weitergereicht** (nur umgepackt statt
konvertiert) — das kostet praktisch keine CPU. Muss ein Video doch
konvertiert werden, weil der Browser den Codec nicht abspielen kann, kann
Spherix die Grafikeinheit statt der CPU nutzen.

Dafür genügt `--device /dev/dri` (siehe oben) bzw. in Unraid derselbe
Eintrag unter _Extra Parameters_. Beim Start wird automatisch geprüft, ob
eine nutzbare GPU vorhanden ist:

- `[Transcode] GPU encoding enabled via VAAPI` → Grafikeinheit wird genutzt
- `[Transcode] ... encoding on CPU` → kein Zugriff, läuft über die CPU

Ohne GPU funktioniert alles weiterhin, Konvertieren belastet dann nur die
CPU stärker. Unterstützt werden Intel (QuickSync) und AMD.

## 🛠️ Entwicklung (Lokales Setup)

### Voraussetzungen

- Node.js >= 20
- pnpm >= 9
- Docker (für lokale Datenbank-Instanzen)

### 1. Installation

```bash
git clone https://github.com/1899nils/Spherix.git
cd Spherix
pnpm install
```

### 2. Datenbanken starten

```bash
docker compose up -d postgres redis
```

### 3. Datenbank-Setup

```bash
pnpm db:generate
pnpm db:migrate
```

### 4. Starten

```bash
# Backend + Frontend parallel starten
pnpm dev

# Oder einzeln:
pnpm dev:server   # Backend auf Port 3000
pnpm dev:web      # Frontend auf Port 5173
```

## 🏗️ Projektstruktur

- `apps/server`: Node.js + Express Backend mit Prisma ORM.
- `apps/web`: React + Vite Frontend.
- `packages/shared`: Gemeinsame TypeScript-Typen für Konsistenz zwischen API und UI.

## 🧰 Technologien

- **Frontend:** React 19, Vite 6, Tailwind CSS, Lucide Icons.
- **Backend:** Node.js, Express, BullMQ (für Background-Jobs).
- **Datenbank:** PostgreSQL (Prisma ORM).
- **Cache & Sessions:** Redis.
- **Metadaten:** `music-metadata`.

## 📄 Lizenz

Dieses Projekt ist unter der MIT-Lizenz lizenziert.
