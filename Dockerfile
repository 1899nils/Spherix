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

# tini handles PID 1 responsibilities (zombie reaping, signal forwarding)
RUN apk add --no-cache nginx supervisor postgresql16 postgresql16-client redis tini

WORKDIR /app

# Runtime dependencies (node_modules from pnpm install + Prisma client)
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
COPY apps/web/dist /usr/share/nginx/html

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

    location ^~ /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffering off;
        proxy_request_buffering off;
        client_max_body_size 0;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }

    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
NGINX

# Supervisor config: run nginx, node, postgres, redis
# Services start in priority order (lower = earlier). Server waits for DB/Redis.
RUN cat > /etc/supervisord.conf <<'EOF'
[supervisord]
nodaemon=true
logfile=/dev/null
logfile_maxbytes=0
loglevel=warn
pidfile=/tmp/supervisord.pid
childlogdir=/tmp

[program:postgres]
command=postgres -D /data/postgres
user=postgres
priority=10
autostart=true
autorestart=true
startsecs=3
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:redis]
command=redis-server --dir /data/redis --appendonly yes
priority=10
autostart=true
autorestart=true
startsecs=2
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
startsecs=5
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
