# Fullstack Trello Clone: Next.js 14, Server Actions, React, Prisma, Stripe, Tailwind, MySQL

![image](https://github.com/AntonioErdeljac/next13-trello/assets/23248726/fd260249-82fa-4588-a67a-69bb4eb09067)


This is a repository for Fullstack Trello Clone: Next.js 14, Server Actions, React, Prisma, Stripe, Tailwind, MySQL

[VIDEO TUTORIAL](https://www.youtube.com/watch?v=pRybm9lXW2c)

Key Features:
- Auth 
- Organizations / Workspaces
- Board creation
- Unsplash API for random beautiful cover images
- Activity log for entire organization
- Board rename and delete
- List creation
- List rename, delete, drag & drop reorder and copy
- Card creation
- Card description, rename, delete, drag & drop reorder and copy
- Card activity log
- Board limit for every organization
- Stripe subscription for each organization to unlock unlimited boards
- Landing page
- MySQL DB
- Prisma ORM
- shadcnUI & TailwindCSS

### Prerequisites

**Node version 18.x.x**

### Cloning the repository

```shell
git clone https://github.com/AntonioErdeljac/next13-trello.git
```

### Install packages

```shell
npm i
```

### Setup .env file


```js
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=
NEXT_PUBLIC_CLERK_SIGN_UP_URL=
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=

DATABASE_URL=

NEXT_PUBLIC_UNSPLASH_ACCESS_KEY=

STRIPE_API_KEY=

NEXT_PUBLIC_APP_URL=

STRIPE_WEBHOOK_SECRET=
```

### Setup Prisma

Add MySQL Database (I used PlanetScale)

```shell
npx prisma generate
npx prisma db push

```

### Start the app

```shell
npm run dev
```

## Available commands

Running commands with npm `npm run [command]`

| command         | description                              |
| :-------------- | :--------------------------------------- |
| `dev`           | Starts a development instance of the app |

## Generate Client

The typed API client under `lib/client/` is auto-generated from the FastAPI OpenAPI schema exposed by `trella-backend` via [`@hey-api/openapi-ts`](https://heyapi.dev/). Do not edit those files by hand — they are overwritten on every regen.

### Invocation paths

There are two ways to regenerate the client. Pick the one that matches your setup.

**1. Full pipeline (recommended).** From the **repository root**, with the backend Python venv active so `app.main` is importable:

```shell
bash ./scripts/generate-client.sh
```

This exports `trella-backend`'s OpenAPI schema to `trella-frontend/openapi.json`, then runs the codegen step against it. Set `SKIP_CODEGEN=1` to refresh `openapi.json` only and skip the codegen step.

**2. Manual codegen only.** From inside `trella-frontend/`, when an up-to-date `openapi.json` is already present at the repo root of this package:

```shell
npm run generate-client
```

This skips the schema export and only runs `@hey-api/openapi-ts` against the existing `trella-frontend/openapi.json`. It will fail with a non-zero exit code if `openapi.json` is missing.

### Environment variables

The generated client reads its base URL from `NEXT_PUBLIC_API_URL`. If unset, it falls back to `http://localhost:8000` and emits a one-time `console.warn` in development and production builds.

| Variable | Default | Notes |
| :--- | :--- | :--- |
| `NEXT_PUBLIC_API_URL` | `http://localhost:8000` | Base URL for the generated SDK; see `.env.example` for the canonical value. |

Copy `.env.example` to `.env.local` and adjust as needed for staging/production deployments.

### Regenerate before commit

> ⚠️ **Whenever the backend OpenAPI schema changes, regenerate the client before committing.** The pre-commit hook `generate-frontend-sdk` declared in `trella-backend/.pre-commit-config.yaml` runs `bash ./scripts/generate-client.sh` automatically when staged changes touch `backend/` or the script itself, but you should still run it manually whenever you pull backend changes or modify a route, schema, or response model. Forgetting to regenerate leaves `lib/client/` out of sync with the backend and will surface as type errors at build time.
