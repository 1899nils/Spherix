#!/bin/sh

echo "=== MusicServer starting ==="

# Ensure data directories exist
mkdir -p /data/covers /data/redis /data/logs

# --- Initialize PostgreSQL if needed ---
if [ ! -d "/data/postgres/PG_VERSION" ]; then
  echo "Initializing PostgreSQL database..."
  rm -rf /data/postgres
  mkdir -p /data/postgres
  chown postgres:postgres /data/postgres
  chmod 700 /data/postgres

  if ! su postgres -c "initdb -D /data/postgres --auth-local=trust --auth-host=md5" 2>&1; then
    echo "ERROR: PostgreSQL initdb failed"
    exit 1
  fi

  # Start PostgreSQL temporarily to create user and database
  su postgres -c "pg_ctl -D /data/postgres -l /data/logs/postgres-init.log start -w"
  sleep 1

  echo "Creating database user and database..."
  su postgres -c "psql -c \"CREATE USER musicserver WITH PASSWORD 'musicserver';\"" 2>&1
  su postgres -c "psql -c \"CREATE DATABASE musicserver OWNER musicserver;\"" 2>&1

  su postgres -c "pg_ctl -D /data/postgres stop -w"
  sleep 1
  echo "PostgreSQL initialized successfully"
else
  echo "PostgreSQL data directory found, skipping init"
  chown -f postgres:postgres /data/postgres
fi

# Start PostgreSQL and Redis for migrations
echo "Starting PostgreSQL for migrations..."
su postgres -c "pg_ctl -D /data/postgres -l /data/logs/postgres.log start -w" 2>&1
if [ $? -ne 0 ]; then
  echo "ERROR: PostgreSQL failed to start. Log:"
  cat /data/logs/postgres.log 2>/dev/null
  exit 1
fi

echo "Starting Redis for migrations..."
redis-server --dir /data/redis --appendonly yes --daemonize yes --logfile /data/logs/redis.log 2>&1

# Wait for services
sleep 1

# Run database migrations
echo "Running database migrations..."
cd /app/apps/server
if ! npx prisma migrate deploy 2>&1; then
  echo "WARNING: Prisma migrate failed, server may still start if tables exist"
fi
cd /app

# Stop temporary services (supervisor will manage them)
redis-cli shutdown 2>/dev/null || true
su postgres -c "pg_ctl -D /data/postgres stop -w" 2>/dev/null || true
sleep 1

echo "Starting all services via supervisor..."
exec supervisord -c /etc/supervisord.conf
