FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# Build shared package
FROM deps AS build-shared
COPY packages/shared/ ./packages/shared/
RUN pnpm --filter @musicserver/shared build

# Build web app
FROM deps AS build
COPY --from=build-shared /app/packages/shared/dist ./packages/shared/dist
COPY apps/web/ ./apps/web/
COPY packages/shared/ ./packages/shared/
RUN pnpm --filter @musicserver/web build

# Serve with nginx
FROM nginx:alpine AS production
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
