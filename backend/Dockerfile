# AVICHIAN API — production image for Render / Railway / Fly / any Docker host
# Build context: this backend repo root (or monorepo backend/ with shared/)

FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY shared/package.json ./shared/
# Install with workspaces when lockfile exists at root of this context
RUN npm install --omit=dev=false

FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build -w @avichian/shared 2>/dev/null || (cd shared && npx tsc)
RUN npx prisma generate
RUN npm run build

FROM node:20-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV APP_ENV=production
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/shared ./shared
COPY --from=build /app/scripts ./scripts
# Local upload fallback (prefer R2 in multi-instance)
RUN mkdir -p uploads
EXPOSE 4000
# migrate deploy is best-effort if no migration history; db push for greenfield optional via RELEASE_COMMAND
CMD ["sh", "-c", "npx prisma migrate deploy || npx prisma db push; node dist/index.js"]
