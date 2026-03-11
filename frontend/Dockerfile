FROM oven/bun:1 AS build

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

# Build the Vite app.
COPY . .
RUN bun run build

FROM nginx:1.27-alpine AS runtime

# SPA fallback and static serving config.
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
