# Repository Guidelines

## Project Structure & Module Organization

The application is a Next.js App Router project. Pages and API handlers live in `src/app/`; reusable UI is in `src/components/`, with TikTok-specific views under `src/components/tiktok/` and generated-style primitives under `src/components/ui/`. Server-side TikTok fetching, caching, and data access live in `src/lib/tiktok/`; database setup is in `src/lib/db.ts` and the Prisma schema is `prisma/schema.prisma`. Static assets and demo videos are in `public/`. The standalone comment scraper is in `mini-services/tiktok-comments/`.

## Build, Test, and Development Commands

- `bun install` installs the root dependencies from `bun.lock`.
- `bun run dev` starts the Next.js development server on port 3000.
- `bun run build` creates the production build and copies static assets into the standalone output.
- `bun run start` serves the production standalone build.
- `bun run lint` runs ESLint across the repository.
- `bun run db:generate` regenerates the Prisma client; `bun run db:push` applies the schema to the configured database.
- In `mini-services/tiktok-comments/`, run `bun install` and `bun run dev` to start the comment service on port 3040.

## Coding Style & Naming Conventions

Use TypeScript and follow the existing Next.js conventions. Keep two-space indentation, use `PascalCase` for React components and `camelCase` for functions and variables. Use kebab-case for component filenames (for example, `video-card.tsx`) and group feature-specific code in its existing directory. Prefer the `@/` alias for imports from `src/`. Run ESLint before submitting changes; there is no separate formatter configured.

## Testing Guidelines

There is no dedicated test framework or test script in the repository. Run `bun run lint` and `bun run build` for changes that affect application behavior. For database changes, review `prisma/schema.prisma` and regenerate the Prisma client; exercise the affected flow locally when practical. No coverage requirement is configured.

## Commit & Pull Request Guidelines

Recent history uses short, informal summaries, with no enforced commit format. Write a concise imperative subject that describes the change (for example, `Fix video pagination`). Pull requests should explain the user-visible change, note relevant configuration or database updates, and include screenshots for UI changes. Link related issues when applicable and report the lint/build checks performed.

## Security & Configuration

Keep secrets and local environment files out of commits. Configure runtime values such as `TIKTOK_PROXY`, `DEMO_MODE`, and `DATABASE_URL` through the environment as described in the README. Treat proxy credentials and database contents as sensitive.
