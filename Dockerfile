FROM node:20-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate


WORKDIR /app

COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src ./src

RUN pnpm build

FROM node:20-alpine AS production

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

COPY pnpm-lock.yaml package.json ./
RUN pnpm install --frozen-lockfile --prod

COPY --from=builder /app/dist ./dist


ENV NODE_ENV=production
ENV PORT=8082

EXPOSE 8082

CMD ["pnpm", "start"]