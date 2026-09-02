# OneInfo AI Video Creator

Multi-creator AI video creation MVP: idea → hooks → script → Tanglish →
storyboard → video/audio → render → QA → final video.

## Layout

```text
oneinfo/
├── frontend/   Next.js/React/TypeScript app — see frontend/README.md
├── backend/    FastAPI/Postgres+pgvector API — see backend/README.md
└── docs/       (build package reference, not code)
```

## Status

- **Phase 01 — Frontend Foundation**: done. App shell, dev-mock auth (two
  seeded creators), protected routes, reusable UI, page shells for the
  full workflow.
- **Phase 02 — Backend + Database + RAG**: done. FastAPI, Supabase
  Postgres+pgvector, creator-scoped knowledge upload/ingestion/retrieval,
  server-side ownership enforcement. See `backend/README.md` for the
  tenant-isolation acceptance test.

Frontend and backend are not yet wired together — that lands as part of
later integration phases. Each currently runs and is tested independently.

## Quickstart

```bash
cd frontend && npm install && npm run dev      # http://localhost:3000

cd backend && ./.venv/Scripts/pytest -v        # or set up per backend/README.md
```
