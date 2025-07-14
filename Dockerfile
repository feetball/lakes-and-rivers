# Use the official Node.js 20 Alpine image for smaller size
FROM node:20-alpine AS base

# Install dependencies only when needed
FROM base AS deps
# Check https://github.com/nodejs/docker-node/tree/b4117f9333da4138b03a546ec926ef50a31506c3#nodealpine to understand why libc6-compat might be needed.
RUN apk add --no-cache libc6-compat netcat-openbsd wget
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json package-lock.json* ./
RUN npm ci

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# Production image, copy all the files and run next
FROM base AS runner
WORKDIR /app

# Install runtime dependencies for healthcheck and wait script
RUN apk add --no-cache wget netcat-openbsd

ENV NODE_ENV=production
# Uncomment the following line in case you want to disable telemetry during runtime.
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown nextjs:nodejs .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy static data files if they exist (prefer compressed versions)
COPY --from=builder --chown=nextjs:nodejs /app/data ./data


# Copy preload script
COPY --chown=nextjs:nodejs preload-data.js ./

# Copy startup script  
COPY --chown=nextjs:nodejs startup.js ./

# Healthcheck for Next.js API health endpoint
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=3 \
  CMD wget -qO- http://localhost:${PORT:-3000}/api/health || exit 1

USER nextjs

# Railway will set the PORT environment variable
EXPOSE 3000

ENV HOSTNAME="0.0.0.0"
ENV REDIS_HOST="redis"
ENV REDIS_PORT="6379"

# Add wait-for-redis script and use it to block until Redis is ready
COPY --chown=nextjs:nodejs wait-for-redis.sh ./
RUN chmod +x ./wait-for-redis.sh
CMD ["node", "startup.js"]
