FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN pnpm db:generate && pnpm --filter @myservice/api build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
RUN corepack enable
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3001
CMD ["node","apps/api/dist/main.js"]
