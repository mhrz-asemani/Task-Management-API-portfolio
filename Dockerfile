# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder --chown=node:node /app/dist ./dist
COPY --chown=node:node migrations ./migrations
COPY --chown=node:node openapi.json ./openapi.json
RUN chown -R node:node /app

USER node

EXPOSE 3000

# Run database migrations before accepting API traffic.
CMD ["sh", "-c", "node dist/migrate.js && exec node dist/server.js"]
