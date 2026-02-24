# =============================================================================
# Spherix – All-in-one Image (Server + Web + PostgreSQL + Redis)
# =============================================================================

# --- Stage 1: Build ---
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

# --- Stage 2: Production ---
FROM node:20-alpine AS production

# Install system dependencies
RUN apk add --no-cache \
    nginx \
    supervisor \
    postgresql16 \
    postgresql16-client \
    redis \
    tini \
    openssl

WORKDIR /app

# Copy all required node_modules to preserve symlinks
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules

# Copy built app files
COPY --from=builder /app/packages/shared/dist ./packages/shared/dist
COPY --from=builder /app/packages/shared/package.json ./packages/shared/package.json
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/prisma ./apps/server/prisma
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Setup Nginx
RUN cat > /etc/nginx/http.d/default.conf <<'NGINX'
server {
    listen 80 default_server;
    server_name _;
    
    root /usr/share/nginx/html;
    index index.html;

    # Backend API proxy
    location /api {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }

    # SPA support: Route everything else to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Static assets caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
NGINX

# Setup Supervisor
RUN cat > /etc/supervisord.conf <<'EOF'
[supervisord]
nodaemon=true
logfile=/dev/stdout
logfile_maxbytes=0
loglevel=info
pidfile=/tmp/supervisord.pid

[program:postgres]
command=postgres -D /data/postgres
user=postgres
priority=10
autostart=true
autorestart=true
startsecs=5
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
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
environment=NODE_ENV="production",DATABASE_URL="postgresql://musicserver:musicserver@localhost:5432/musicserver",REDIS_URL="redis://localhost:6379"
EOF

# Startup script
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Environment & Volumes
ENV NODE_ENV=production
ENV DATABASE_URL=postgresql://musicserver:musicserver@localhost:5432/musicserver
ENV REDIS_URL=redis://localhost:6379

VOLUME ["/music", "/data"]
EXPOSE 80 3000

ENTRYPOINT ["/sbin/tini", "--", "/docker-entrypoint.sh"]
