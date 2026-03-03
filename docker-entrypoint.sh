#!/bin/sh
# =============================================================================
# Spherix – Container-Startup
# =============================================================================
# WICHTIG: Datenpersistenz
#   Alle Daten liegen unter /data (gemountet via docker-compose.yml).
#   Standardmäßig ist das ./data/ neben der docker-compose.yml auf dem Host.
#   Pfad kann über DATA_PATH in der .env-Datei geändert werden.
#   NIEMALS "docker compose down -v" verwenden — löscht named volumes!
# =============================================================================

# Stoppe bei Fehlern (außer explizit mit || true behandelt)
set -e

echo "============================================================"
echo "  Spherix Startup — $(date)"
echo "============================================================"

# Sicherheitscheck: Ist /data gemountet (nicht leer nach Container-Start)?
echo "[1/6] Prüfe Daten-Volume..."

# Wenn /data/postgres existiert und PG_VERSION enthält → vorhandene Daten
if [ -f "/data/postgres/PG_VERSION" ]; then
  PG_MAJOR=$(cat /data/postgres/PG_VERSION | cut -d. -f1)
  echo "  ✓ Bestehende PostgreSQL-Daten gefunden (Version $PG_MAJOR)"
  echo "  ✓ Datenbankdaten bleiben erhalten — kein Datenverlust"
else
  echo "  ! Kein bestehender PostgreSQL-Datenbankordner gefunden"
  echo "  → Datenbank wird neu initialisiert (Erststart)"
fi

# Verzeichnisse anlegen
echo "[2/6] Verzeichnisstruktur..."
mkdir -p /data/postgres /data/redis /data/covers /data/logs

# Berechtigungen für PostgreSQL
chown -R postgres:postgres /data/postgres /data/logs

# PostgreSQL-Socket-Verzeichnis
mkdir -p /run/postgresql
chown postgres:postgres /run/postgresql

echo "  ✓ Verzeichnisse: /data/postgres, /data/redis, /data/covers, /data/logs"

# Stale PID entfernen (nach unsauberem Shutdown)
if [ -f "/data/postgres/postmaster.pid" ]; then
  echo "  ! Veraltete postmaster.pid gefunden — wird entfernt (unclean shutdown)"
  rm -f /data/postgres/postmaster.pid
fi

# --- PostgreSQL initialisieren (nur beim Erststart) -------------------------
echo "[3/6] Datenbank prüfen..."

if [ ! -f "/data/postgres/PG_VERSION" ]; then
  echo "  → Erststart: Initialisiere PostgreSQL..."
  su postgres -c "initdb -D /data/postgres --auth-local=trust --auth-host=md5 --encoding=UTF8 --locale=C" \
    >> /data/logs/postgres-init.log 2>&1

  echo "listen_addresses = 'localhost'" >> /data/postgres/postgresql.conf

  # Temporär starten für User/DB-Anlage
  su postgres -c "pg_ctl -D /data/postgres -l /data/logs/postgres.log start -w" \
    >> /data/logs/postgres.log 2>&1
  su postgres -c "psql -c \"CREATE USER musicserver WITH PASSWORD 'musicserver';\""
  su postgres -c "psql -c \"CREATE DATABASE musicserver OWNER musicserver;\""
  su postgres -c "pg_ctl -D /data/postgres stop -m fast -w" \
    >> /data/logs/postgres.log 2>&1

  echo "  ✓ PostgreSQL initialisiert und Benutzer angelegt"
else
  # PostgreSQL-Versionsprüfung
  PG_BIN_VERSION=$(postgres --version 2>/dev/null | grep -oP '\d+' | head -1)
  PG_DATA_VERSION=$(cat /data/postgres/PG_VERSION | cut -d. -f1)

  if [ "$PG_BIN_VERSION" != "$PG_DATA_VERSION" ]; then
    echo "  ✗ FEHLER: PostgreSQL-Versions-Konflikt!"
    echo "    Binär-Version:  $PG_BIN_VERSION"
    echo "    Daten-Version:  $PG_DATA_VERSION"
    echo "    Bitte manuell pg_upgrade durchführen oder Daten sichern und neu initialisieren."
    echo "    DATENVERLUST-Risiko: Container wird NICHT gestartet."
    exit 1
  fi

  echo "  ✓ Bestehende Datenbank (PG $PG_DATA_VERSION) wird verwendet"
fi

# --- Redis und PostgreSQL für Migrationen starten ---------------------------
echo "[4/6] Temporäre Services für Migrationen..."

su postgres -c "pg_ctl -D /data/postgres -l /data/logs/postgres.log start -w" \
  >> /data/logs/postgres.log 2>&1

redis-server --dir /data/redis --appendonly yes --daemonize yes \
  >> /data/logs/redis.log 2>&1

echo "  ✓ PostgreSQL und Redis gestartet"

# --- Prisma-Migrationen anwenden --------------------------------------------
echo "[5/6] Datenbank-Migrationen..."

cd /app/apps/server
if npx prisma migrate deploy >> /data/logs/migrations.log 2>&1; then
  echo "  ✓ Migrationen erfolgreich angewendet"
else
  echo "  ! Migrationen fehlgeschlagen (Details: /data/logs/migrations.log)"
  echo "    Server wird trotzdem gestartet..."
fi

# Frontend-Prüfung
if [ ! -f "/usr/share/nginx/html/index.html" ]; then
  echo "  ✗ KRITISCH: Frontend-Build fehlt! Container-Build möglicherweise unvollständig."
fi

# Services sauber herunterfahren für Supervisor-Übergabe
echo "[6/6] Übergabe an Supervisor..."

redis-cli shutdown || true
su postgres -c "pg_ctl -D /data/postgres stop -m fast -w" >> /data/logs/postgres.log 2>&1 || true

echo "============================================================"
echo "  Starte alle Services (nginx, postgres, redis, server)..."
echo "  Daten liegen in: /data ($(df -h /data | tail -1 | awk '{print $4}') frei)"
echo "============================================================"

exec supervisord -c /etc/supervisord.conf
