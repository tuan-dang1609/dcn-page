FROM oven/bun:1 AS runtime

WORKDIR /app

# Install production dependencies first to maximize build cache reuse.
COPY package.json ./
RUN bun install --production

# Copy application source.
COPY . .

ENV NODE_ENV=production

EXPOSE 3000

CMD ["bun", "run", "index.ts"]
