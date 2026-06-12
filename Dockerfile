# Build stage: typecheck + bundle the client with Vite.
FROM node:24-alpine AS build
WORKDIR /app

# VITE_DISCORD_CLIENT_ID is public and gets inlined into the client bundle at
# build time, so it arrives as a build arg (compose passes it from .env).
ARG VITE_DISCORD_CLIENT_ID
ARG VITE_RESOURCE_BASE
ENV VITE_DISCORD_CLIENT_ID=${VITE_DISCORD_CLIENT_ID} \
    VITE_RESOURCE_BASE=${VITE_RESOURCE_BASE}

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Runtime stage: Express only (client deps are devDependencies by design).
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

# @napi-rs/canvas needs a system font for the scoreboard card text, and the
# scoreboard store persists to /app/data (volume-mounted in compose).
RUN apk add --no-cache font-dejavu && mkdir -p /app/data && chown node:node /app/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY --from=build /app/dist ./dist

EXPOSE 3000
USER node
# Node 24 runs the TypeScript server directly via type stripping.
CMD ["node", "server/index.ts"]
