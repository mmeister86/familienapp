# syntax=docker/dockerfile:1

# --- Stage 1: build the SPA -------------------------------------------------
FROM node:22-alpine AS build
WORKDIR /app

# Pin pnpm so the frozen lockfile is installed identically to CI/local.
# (Bypass corepack: corepack <0.31 hardcodes pnpm's old bin/pnpm.cjs layout,
# which pnpm >=12 no longer ships -> "Cannot find module .../bin/pnpm.cjs".)
RUN npm install -g pnpm@12.8.1

# Workspace config carries pnpm build approvals (allowBuilds: esbuild).
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

# Baked into the bundle at build time. Coolify MUST pass this as a BUILD arg,
# never as a runtime env var (see README "Deploy").
ARG VITE_CONVEX_URL=https://familybackend.matthias.lol
ENV VITE_CONVEX_URL=$VITE_CONVEX_URL
RUN pnpm build

# --- Stage 2: serve the static bundle ---------------------------------------
FROM nginx:alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
