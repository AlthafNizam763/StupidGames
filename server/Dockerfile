# VOIDLINE game server.
#
# Build context is the REPOSITORY ROOT, not this directory:
#
#   docker build -f server/Dockerfile -t voidline-server .
#
# The server depends on the `@voidline/shared` workspace, which npm installs as
# a symlink into `node_modules/@voidline/shared` pointing at `/app/shared`. That
# is why the runtime stage copies `shared/dist` and the workspace layout rather
# than only `server/dist` - without it the symlink dangles and the process dies
# on its first import.
#
# Debian slim rather than Alpine: `@node-rs/argon2` is a native module, and
# glibc prebuilds are the better-travelled path. Alpine would work but would
# make a musl build the thing standing between a deploy and a password hash.

# --------------------------------------------------------------------- build -
FROM node:24-bookworm-slim AS build

WORKDIR /app

# Manifests first, so a source change does not invalidate the install layer.
# Every workspace manifest is needed even though only two are built: npm
# validates the lockfile against the whole workspace tree.
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/

RUN npm ci

COPY tsconfig.base.json ./
COPY shared/ shared/
COPY server/ server/

# shared first - the server compiles against its emitted declarations.
RUN npm run build -w @voidline/shared \
 && npm run build -w @voidline/server

# ------------------------------------------------------------------- runtime -
FROM node:24-bookworm-slim AS runtime

ENV NODE_ENV=production

WORKDIR /app

COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY web/package.json web/

# Production dependencies for this workspace only.
#
# `--workspace` scopes the install, which keeps the client's dependency tree -
# Next, React and their build chain - out of a server image that will never
# render a page. Verified: 162 packages rather than the full tree.
#
# `--include-workspace-root` is required because the root manifest holds the
# workspace definitions the symlinks are built from.
RUN npm ci --omit=dev --workspace=@voidline/server --include-workspace-root \
 && npm cache clean --force

COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/server/dist server/dist

# Drop privileges. `node` exists in the base image; the application writes
# nothing to disk, so it needs no ownership beyond reading its own code.
USER node

EXPOSE 4000

# No curl or wget in slim, and adding one to run a health check would be a
# larger attack surface than the check is worth.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Exec form, so node is PID 1 and receives SIGTERM directly.
#
# The shell form would put `/bin/sh` at PID 1, which does not forward signals -
# the platform's SIGTERM would go to the shell, the graceful shutdown in
# src/index.ts would never run, and every deploy would wait out the termination
# grace period before being killed. Live matches are held in memory, so that is
# the difference between draining them and dropping them.
CMD ["node", "server/dist/index.js"]
