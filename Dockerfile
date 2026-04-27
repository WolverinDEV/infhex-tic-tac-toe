# syntax=docker/dockerfile:experimental
FROM node:22-alpine AS build

ARG GITHUB_SHA
ARG VITE_OPENREPLAY_PROJECT_KEY=3cwetvApbpUmvIOlsktv
ARG VITE_OPENREPLAY_INGEST_POINT=https://hexo.did.science/api/ingest

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV VITE_OPENREPLAY_PROJECT_KEY="$VITE_OPENREPLAY_PROJECT_KEY"
ENV VITE_OPENREPLAY_INGEST_POINT="$VITE_OPENREPLAY_INGEST_POINT"

RUN apk add git
RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.node.json eslint.config.ts ./

# COPY --parents packages/*/package.json .
COPY packages/shared/package.json packages/shared/package.json
COPY packages/backend/package.json packages/backend/package.json
COPY packages/frontend/package.json packages/frontend/package.json
COPY packages/bot-worker/package.json packages/bot-worker/package.json
COPY packages/bot-engine-dummy/package.json packages/bot-engine-dummy/package.json
COPY packages/bot-engine-seal/package.json packages/bot-engine-seal/package.json


RUN pnpm install --frozen-lockfile

COPY . .

RUN pnpm generate:changelog
RUN pnpm build

FROM node:22-alpine AS runtime

ENV NODE_ENV=production
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV FRONTEND_DIST_PATH="/app/packages/frontend/dist/"

RUN corepack enable

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json tsconfig.node.json eslint.config.ts ./
COPY packages/backend/package.json packages/backend/package.json

COPY --from=build /app/packages/backend/dist/ ./packages/backend/dist/
COPY --from=build /app/packages/frontend/dist/ ./packages/frontend/dist/

RUN cd packages/backend && pnpm install --frozen-lockfile

EXPOSE 3001

CMD ["node", "packages/backend/dist/server.cjs"]
