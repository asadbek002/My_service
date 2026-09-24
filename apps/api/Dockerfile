FROM node:22-alpine AS build
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN pnpm db:generate && pnpm --filter @myservice/api build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# Pre-fetch pnpm so one-off jobs (pnpm db:migrate) do not download it at run time.
RUN corepack enable && corepack prepare pnpm@10.0.0 --activate
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3001
CMD ["node","apps/api/dist/main.js"]
