#!/bin/sh
set -e

echo "=== MusicServer starting ==="

# Ensure data directories exist
mkdir -p /data/covers /data/redis

# --- Initialize PostgreSQL if needed ---
if [ ! -d "/data/postgres" ]; then
  echo "Initializing PostgreSQL database..."
  mkdir -p /data/postgres
  chown postgres:postgres /data/postgres
  su postgres -c "initdb -D /data/postgres"

  # Allow local connections without password for setup
  echo "host all all 127.0.0.1/32 md5" >> /data/postgres/pg_hba.conf
  echo "local all all trust" >> /data/postgres/pg_hba.conf

  # Start PostgreSQL temporarily to create user and database
  su postgres -c "pg_ctl -D /data/postgres -l /tmp/pg_init.log start"
  sleep 2

  su postgres -c "psql -c \"CREATE USER musicserver WITH PASSWORD 'musicserver';\""
  su postgres -c "psql -c \"CREATE DATABASE musicserver OWNER musicserver;\""

  su postgres -c "pg_ctl -D /data/postgres stop"
  sleep 1
else
  chown postgres:postgres /data/postgres
fi

# Start PostgreSQL and Redis for migrations
su postgres -c "pg_ctl -D /data/postgres -l /tmp/pg.log start"
redis-server --dir /data/redis --appendonly yes --daemonize yes
sleep 2

# Run database migrations
echo "Running database migrations..."
cd /app/apps/server
npx prisma migrate deploy
cd /app

# Stop temporary services (supervisor will manage them)
redis-cli shutdown || true
su postgres -c "pg_ctl -D /data/postgres stop" || true
sleep 1

echo "Starting all services..."
exec supervisord -c /etc/supervisord.conf
