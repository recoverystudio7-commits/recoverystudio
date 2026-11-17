\# AGENTS.md - Convenciones para Recovery Studio



\## Stack

\- \*\*Frontend\*\*: React + Vite + TypeScript

\- \*\*Backend/BaaS\*\*: Supabase (Postgres + Auth + Realtime + Edge Functions)

\- \*\*Hosting\*\*: GitHub Pages (www.recoverystudio.cl)

\- \*\*Deploy\*\*: Push a `main` = deploy automático



\## Comandos clave

```bash

npm run dev        # Desarrollo local

npm run build      # Build producción (genera dist/)

npm run lint       # ESLint

npm run typecheck  # tsc --noEmit

npm test           # Vitest

