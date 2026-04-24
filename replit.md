# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Replit Setup

- **Active app**: `artifacts/pdf-translator` — a client-side Vite React app (PDF translation runs entirely in the browser via `pdfjs-dist`, `jspdf`, `jszip`).
- **Workflow**: `Start application` runs `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/pdf-translator run dev` and serves the frontend on port 5000 (host `0.0.0.0`, `allowedHosts: true` for the Replit iframe proxy).
- **Deployment**: configured as `static` — builds with `PORT=5000 BASE_PATH=/ pnpm --filter @workspace/pdf-translator run build` and serves from `artifacts/pdf-translator/dist/public`.

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
