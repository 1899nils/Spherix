# =============================================================================
# MusicServer – Combined Image (Server + Web)
# Runs Node.js backend + nginx frontend in a single container
# =============================================================================

# --- Base ---
FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# --- Dependencies ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json ./apps/server/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# --- Build shared ---
FROM deps AS build-shared
COPY packages/shared/ ./packages/shared/
RUN pnpm --filter @musicserver/shared build

# --- Build server ---
FROM deps AS build-server
COPY --from=build-shared /app/packages/shared/dist ./packages/shared/dist
COPY --from=build-shared /app/packages/shared/src ./packages/shared/src
COPY apps/server/ ./apps/server/
COPY packages/shared/ ./packages/shared/
RUN pnpm --filter @musicserver/server prisma:generate
RUN pnpm --filter @musicserver/server build

# --- Build web ---
FROM deps AS build-web
COPY --from=build-shared /app/packages/shared/dist ./packages/shared/dist
COPY --from=build-shared /app/packages/shared/src ./packages/shared/src
COPY apps/web/ ./apps/web/
COPY packages/shared/ ./packages/shared/
RUN pnpm --filter @musicserver/web build

# --- Production ---
FROM node:20-alpine AS production

RUN apk add --no-cache nginx supervisor

WORKDIR /app

# Copy server
COPY --from=build-server /app/node_modules ./node_modules
COPY --from=build-server /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build-server /app/apps/server/dist ./apps/server/dist
COPY --from=build-server /app/apps/server/prisma ./apps/server/prisma
COPY --from=build-server /app/apps/server/package.json ./apps/server/
COPY --from=build-server /app/packages/shared/dist ./packages/shared/dist
COPY --from=build-server /app/packages/shared/package.json ./packages/shared/

# Copy web static files
COPY --from=build-web /app/apps/web/dist /usr/share/nginx/html

# Nginx config: proxy /api to localhost:3000
RUN cat > /etc/nginx/http.d/default.conf <<'NGINX'
server {
    listen 80;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
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

# Supervisor config: run both nginx and node
RUN cat > /etc/supervisord.conf <<'EOF'
[supervisord]
nodaemon=true
logfile=/dev/null
logfile_maxbytes=0

[program:nginx]
command=nginx -g "daemon off;"
autostart=true
autorestart=true
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0

[program:server]
command=node /app/apps/server/dist/index.js
directory=/app/apps/server
autostart=true
autorestart=true
environment=NODE_ENV=production
stdout_logfile=/dev/stdout
stdout_logfile_maxbytes=0
stderr_logfile=/dev/stderr
stderr_logfile_maxbytes=0
EOF

ENV NODE_ENV=production

# Volumes for persistent data
VOLUME ["/app/music", "/app/data"]

EXPOSE 80

CMD ["supervisord", "-c", "/etc/supervisord.conf"]
