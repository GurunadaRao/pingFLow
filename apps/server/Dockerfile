# Multi-stage Dockerfile for building the Node TypeScript server
FROM node:18-alpine AS builder

WORKDIR /app

# Install dev deps for build
COPY package.json package-lock.json* ./
RUN npm ci --silent

# Copy sources and build
COPY . .
RUN npm run build

FROM node:18-alpine
WORKDIR /app
ENV NODE_ENV=production

# Install only production deps
COPY package.json package-lock.json* ./
RUN npm ci --only=production --silent

# Copy compiled output
COPY --from=builder /app/dist ./dist

EXPOSE 4000
CMD ["node", "dist/server.js"]
