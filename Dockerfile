# =============================================================================
# Spherix – All-in-one Image (Server + Web + PostgreSQL + Redis)
# Multi-stage build to ensure reliability across all environments.
# =============================================================================

# --- Stage 1: Build Frontend & Backend ---
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
COPY .npmrc pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# Build shared library
COPY packages/shared ./packages/shared
RUN pnpm --filter @musicserver/shared build

# Build backend
COPY apps/server ./apps/server
RUN pnpm --filter @musicserver/server prisma:generate
RUN pnpm --filter @musicserver/server build

# Build frontend
COPY apps/web ./apps/web
RUN pnpm --filter @musicserver/web build

# --- Stage 2: Production Image ---
FROM node:20-alpine AS production

# tini handles PID 1 responsibilities
# openssl is required for Prisma
RUN apk add --no-cache nginx supervisor postgresql16 postgresql16-client redis tini openssl

WORKDIR /app

# Copy dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules

# Copy built assets
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Entrypoint script
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
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        try_files $uri $uri/ /index.html;
    }
}
NGINX

# Supervisor config
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

VOLUME ["/music", "/data"]
EXPOSE 80
ENTRYPOINT ["/sbin/tini", "--", "/docker-entrypoint.sh"]
