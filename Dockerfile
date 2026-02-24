# =============================================================================
# MusicServer – All-in-one Image (Server + Web + PostgreSQL + Redis)
# Single container with everything included for easy self-hosted deployment.
# =============================================================================

# --- Install dependencies & generate Prisma client ---
FROM node:20-alpine AS deps
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

COPY .npmrc pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# Prisma needs to generate platform-specific binaries for Alpine
COPY apps/server/prisma ./apps/server/prisma
RUN pnpm --filter @musicserver/server prisma:generate

# --- Production image ---
FROM node:20-alpine AS production

# tini handles PID 1 responsibilities
# openssl is required for Prisma
RUN apk add --no-cache nginx supervisor postgresql16 postgresql16-client redis tini openssl

WORKDIR /app

# Copy all node_modules to preserve pnpm symlinks and virtual store
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/server/node_modules ./apps/server/node_modules

# Pre-built shared library
COPY packages/shared/dist ./packages/shared/dist
COPY packages/shared/package.json ./packages/shared/

# Pre-built server (including prisma schema + migrations for migrate deploy)
COPY apps/server/dist ./apps/server/dist
COPY apps/server/prisma ./apps/server/prisma
COPY apps/server/package.json ./apps/server/

# Pre-built web frontend
# We try multiple common build paths to be safe in different CI environments
COPY apps/web/dist/ /usr/share/nginx/html/

# Entrypoint script (runs migrations, then starts services)
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Nginx config: proxy /api to localhost:3000
RUN cat > /etc/nginx/http.d/default.conf <<'NGINX'
server {
    listen 80;
    server_name _;
    
    root /usr/share/nginx/html;
    index index.html;

    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX

# Supervisor config: run nginx, node, postgres, redis
# Services start in priority order (lower = earlier). Server waits for DB/Redis.
RUN cat > /etc/supervisord.conf <<'EOF'
[supervisord]
nodaemon=true
logfile=/dev/stdout
logfile_maxbytes=0
loglevel=info
pidfile=/tmp/supervisord.pid
childlogdir=/tmp

[program:postgres]
command=postgres -D /data/postgres
user=postgres
priority=10
autostart=true
autorestart=true
startsecs=5
stopasgroup=true
killasgroup=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:redis]
command=redis-server --dir /data/redis --appendonly yes
priority=10
autostart=true
autorestart=true
startsecs=5
stopasgroup=true
killasgroup=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:nginx]
command=nginx -g "daemon off;"
priority=20
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:server]
command=node /app/apps/server/dist/index.js
directory=/app/apps/server
priority=30
autostart=true
autorestart=true
startretries=10
startsecs=10
stopasgroup=true
killasgroup=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=NODE_ENV="production",DATABASE_URL="postgresql://musicserver:musicserver@localhost:5432/musicserver",REDIS_URL="redis://localhost:6379"
EOF

ENV NODE_ENV=production
ENV DATABASE_URL=postgresql://musicserver:musicserver@localhost:5432/musicserver
ENV REDIS_URL=redis://localhost:6379

# /music = mounted music directory
# /data  = persistent data (postgres, redis, covers)
VOLUME ["/music", "/data"]

EXPOSE 80

# Use tini as PID 1 to properly handle signals and zombie processes
ENTRYPOINT ["/sbin/tini", "--", "/docker-entrypoint.sh"]
