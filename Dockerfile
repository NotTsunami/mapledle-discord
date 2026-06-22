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

# @napi-rs/canvas needs system fonts for the scoreboard card text: font-dejavu
# covers Latin/Cyrillic/Greek, font-noto-all covers every other script (Arabic,
# Thai, Devanagari, Sinhala, Hebrew, …), font-noto-cjk covers CJK names, and
# font-noto-emoji covers emoji — without these they render as tofu boxes. CJK and
# emoji are listed separately because font-noto-all does NOT depend on them.
# NOTE: installing a font is necessary but not sufficient — @napi-rs/canvas only
# falls back across families named in the ctx.font string, not across arbitrary
# system fonts, so each script must also be listed in FONT (see server/scoreboard.ts).
# The scoreboard store persists to /app/data (volume-mounted in compose).
RUN apk add --no-cache font-dejavu font-noto-all font-noto-cjk font-noto-emoji && mkdir -p /app/data && chown node:node /app/data

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY --from=build /app/dist ./dist

EXPOSE 3000
USER node
# Node 24 runs the TypeScript server directly via type stripping.
CMD ["node", "server/index.ts"]
