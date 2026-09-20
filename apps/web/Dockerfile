FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /app
ARG NEXT_PUBLIC_API_URL=/api
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
COPY . .
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @myservice/web build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
RUN corepack enable
WORKDIR /app
COPY --from=build /app /app
EXPOSE 3000
CMD ["pnpm","--filter","@myservice/web","start"]
