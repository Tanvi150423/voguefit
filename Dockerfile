# VogueFit Backend Dockerfile
# Build from repository root, targeting backend folder

# ===== Build Stage =====
FROM node:20-alpine AS builder

WORKDIR /app

# Copy backend package files
COPY backend/package*.json ./
COPY backend/prisma ./prisma/

RUN npm install

# Generate Prisma client
RUN npx prisma generate

# Copy backend source and build
COPY backend/tsconfig.json ./
COPY backend/src ./src/

RUN npm run build

# ===== Production Stage =====
FROM node:20-alpine AS production

WORKDIR /app

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copy production dependencies
COPY backend/package*.json ./
RUN npm install --only=production

# Copy Prisma and generate
COPY backend/prisma ./prisma/
RUN npx prisma generate

# Copy built app
COPY --from=builder /app/dist ./dist/

# Copy public folder
COPY backend/public ./public/

RUN chown -R nodejs:nodejs /app
USER nodejs

ENV PORT=3000
ENV NODE_ENV=production

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:${PORT}/ || exit 1

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]
