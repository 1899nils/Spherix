#!/bin/sh
set -e

echo "=== MusicServer starting ==="
echo "Date: $(date)"
echo "Node: $(node --version)"

# Ensure data directories exist with correct ownership
mkdir -p /data/covers /data/redis /data/logs
chown postgres:postgres /data/logs
mkdir -p /run/postgresql
chown postgres:postgres /run/postgresql

# --- Initialize PostgreSQL if needed ---
if [ ! -f "/data/postgres/PG_VERSION" ]; then
  echo "Initializing PostgreSQL database..."
  rm -rf /data/postgres
  mkdir -p /data/postgres
  chown postgres:postgres /data/postgres
  chmod 700 /data/postgres

  if ! su postgres -c "initdb -D /data/postgres --auth-local=trust --auth-host=md5" 2>&1; then
    echo "ERROR: PostgreSQL initdb failed"
    exit 1
  fi

  # Configure PostgreSQL to listen on localhost
  echo "listen_addresses = 'localhost'" >> /data/postgres/postgresql.conf

  # Start PostgreSQL temporarily to create user and database
  # Note: use Unix socket (no -h flag) because auth-local=trust allows passwordless access
  su postgres -c "pg_ctl -D /data/postgres -l /data/logs/postgres.log start -w"
  sleep 1

  echo "Creating database user and database..."
  if ! su postgres -c "psql -c \"CREATE USER musicserver WITH PASSWORD 'musicserver';\"" 2>&1; then
    echo "ERROR: Failed to create database user"
    su postgres -c "pg_ctl -D /data/postgres stop -w"
    exit 1
  fi
  if ! su postgres -c "psql -c \"CREATE DATABASE musicserver OWNER musicserver;\"" 2>&1; then
    echo "ERROR: Failed to create database"
    su postgres -c "pg_ctl -D /data/postgres stop -w"
    exit 1
  fi

  su postgres -c "pg_ctl -D /data/postgres stop -w"
  sleep 1
  echo "PostgreSQL initialized successfully"
else
  echo "PostgreSQL data directory found, skipping init"
  chown postgres:postgres /data/postgres
  chmod 700 /data/postgres
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

# Wait for services to be fully ready
sleep 2

# Run database migrations
echo "Running database migrations..."
cd /app/apps/server
if npx prisma migrate deploy 2>&1; then
  echo "Migrations applied successfully"
else
  echo "WARNING: Prisma migrate failed, server may still start if tables exist"
fi

# Verify the server can start (quick syntax/import check)
echo "Verifying server module loads..."
if node -e "import('/app/apps/server/dist/index.js').then(() => { console.log('Module loaded OK'); process.exit(0); }).catch(e => { console.error('Module load failed:', e.message); process.exit(1); })" 2>&1; then
  echo "Server module verified"
else
  echo "WARNING: Server module verification failed (may still work under supervisor)"
fi
cd /app

# Stop temporary services (supervisor will manage them)
redis-cli shutdown 2>/dev/null || true
su postgres -c "pg_ctl -D /data/postgres stop -w" 2>/dev/null || true
sleep 1

echo "Starting all services via supervisor..."
exec supervisord -c /etc/supervisord.conf
