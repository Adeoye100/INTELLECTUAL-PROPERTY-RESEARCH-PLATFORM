# syntax=docker/dockerfile:1
FROM node:22.14.0-bookworm-slim AS dependencies
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile --prod

FROM node:22.14.0-bookworm-slim AS runtime-base
ARG VERSION=dev
LABEL org.opencontainers.image.title="IPRP backend" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.source="https://github.com/adeptdev/iprp"
WORKDIR /app
ENV NODE_ENV=production \
    TMPDIR=/tmp \
    PORT=3000
RUN addgroup --system iprp && adduser --system --ingroup iprp --home /app --no-create-home iprp \
  && mkdir -p /var/lib/iprp/exports /tmp \
  && chown -R iprp:iprp /app /var/lib/iprp /tmp
COPY --from=dependencies --chown=iprp:iprp /app/node_modules ./node_modules
COPY --chown=iprp:iprp package.json ./
COPY --chown=iprp:iprp src ./src
COPY --chown=iprp:iprp scripts ./scripts
COPY --chown=iprp:iprp docker/healthcheck.js ./docker/healthcheck.js
USER iprp
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 CMD ["node", "docker/healthcheck.js"]

FROM runtime-base AS api
USER root
COPY --chown=iprp:iprp docker/entrypoints/api.sh /usr/local/bin/iprp-api
RUN chmod 0555 /usr/local/bin/iprp-api
USER iprp
ENTRYPOINT ["/usr/local/bin/iprp-api"]

FROM runtime-base AS watch-worker
USER root
COPY --chown=iprp:iprp docker/entrypoints/watch-worker.sh /usr/local/bin/iprp-watch-worker
RUN chmod 0555 /usr/local/bin/iprp-watch-worker
USER iprp
ENTRYPOINT ["/usr/local/bin/iprp-watch-worker"]

FROM runtime-base AS pdf-export-worker
USER root
COPY --chown=iprp:iprp docker/entrypoints/pdf-export-worker.sh /usr/local/bin/iprp-pdf-export-worker
RUN chmod 0555 /usr/local/bin/iprp-pdf-export-worker
USER iprp
ENTRYPOINT ["/usr/local/bin/iprp-pdf-export-worker"]
