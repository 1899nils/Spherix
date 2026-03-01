FROM node:20-alpine AS base
# ffmpeg provides ffprobe — used by the video scanner for codec/resolution/duration extraction
RUN apk add --no-cache ffmpeg
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/server/package.json ./apps/server/
COPY packages/shared/package.json ./packages/shared/
RUN pnpm install --frozen-lockfile

# Build shared package
FROM deps AS build-shared
COPY packages/shared/ ./packages/shared/
RUN pnpm --filter @musicserver/shared build

# Build server
FROM deps AS build
COPY --from=build-shared /app/packages/shared/dist ./packages/shared/dist
COPY apps/server/ ./apps/server/
COPY packages/shared/ ./packages/shared/
RUN pnpm --filter @musicserver/server prisma:generate
RUN pnpm --filter @musicserver/server build

# Production
FROM base AS production
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/prisma ./apps/server/prisma
COPY --from=build /app/apps/server/package.json ./apps/server/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY package.json pnpm-workspace.yaml ./

WORKDIR /app/apps/server
EXPOSE 3000
CMD ["node", "dist/index.js"]
