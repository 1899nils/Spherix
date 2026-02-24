#!/bin/sh
set -e

echo "=== Spherix Startup Check ==="
echo "Date: $(date)"

# Create required directories
mkdir -p /data/covers /data/redis /data/logs /data/postgres
chown -R postgres:postgres /data/postgres /data/logs
mkdir -p /run/postgresql
chown postgres:postgres /run/postgresql

# --- Initialize Database ---
if [ ! -f "/data/postgres/PG_VERSION" ]; then
  echo "Initializing PostgreSQL..."
  su postgres -c "initdb -D /data/postgres --auth-local=trust --auth-host=md5"
  echo "listen_addresses = 'localhost'" >> /data/postgres/postgresql.conf
  
  su postgres -c "pg_ctl -D /data/postgres -l /data/logs/postgres.log start -w"
  su postgres -c "psql -c \"CREATE USER musicserver WITH PASSWORD 'musicserver';\""
  su postgres -c "psql -c \"CREATE DATABASE musicserver OWNER musicserver;\""
  su postgres -c "pg_ctl -D /data/postgres stop -m fast -w"
fi

# --- Run Migrations ---
echo "Starting PostgreSQL for migrations..."
su postgres -c "pg_ctl -D /data/postgres -l /data/logs/postgres.log start -w"

echo "Starting Redis for migrations..."
redis-server --dir /data/redis --appendonly yes --daemonize yes

echo "Applying database migrations..."
cd /app/apps/server
if npx prisma migrate deploy; then
  echo "Migrations successful."
else
  echo "Migration failed, but proceeding..."
fi

# Verify build output
echo "Checking frontend build:"
ls -l /usr/share/nginx/html/index.html || echo "CRITICAL: Frontend index.html missing!"

# Cleanup for supervisor
echo "Stopping temporary services..."
redis-cli shutdown || true
su postgres -c "pg_ctl -D /data/postgres stop -m fast -w" || true

echo "Starting all services via supervisor..."
exec supervisord -c /etc/supervisord.conf
