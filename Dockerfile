FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Build-time values are non-secret placeholders. Runtime secrets are supplied
# only by the deployment environment.
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build \
    REDIS_URL=redis://localhost:6379 \
    BETTER_AUTH_SECRET=build-only-secret-that-is-not-used-at-runtime-32 \
    NEXT_PUBLIC_APP_URL=${NEXT_PUBLIC_APP_URL} \
    NEXT_PUBLIC_APP_NAME=NEURA \
    EMAIL_PROVIDER=console
RUN npm run build \
    && test -s .next/standalone/server.js \
    && test -s .next/standalone/package.json

FROM deps AS migrator
WORKDIR /app
COPY prisma ./prisma
COPY prisma7.config.ts ./prisma7.config.ts
CMD ["npm", "run", "db:deploy"]

FROM deps AS production-deps
RUN npm prune --omit=dev

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV FILE_STORAGE_ROOT=/data/storage

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs \
  && mkdir -p /data/storage \
  && chown -R nextjs:nodejs /data/storage

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/scripts ./scripts
COPY --from=production-deps --chown=nextjs:nodejs /app/node_modules ./node_modules

USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
