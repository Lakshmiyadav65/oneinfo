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
  server-side ownership enforcement.
- **Phase 03 — AI Content Agents**: done. Idea → hooks → script → Tanglish
  (optional) → storyboard, each backed by a structured agent with RAG
  context, versioned/approval-gated script and Tanglish content, and an
  automatic QA pass on the generated storyboard.

Frontend and backend are not yet wired together — that lands as part of
later integration phases. Each currently runs and is tested independently.
Both phases' hardest requirements (tenant isolation, in Phase 02's case;
"the same pipeline works for two creators," in Phase 03's) are proven by
backend tests that skip cleanly until Supabase credentials exist, then run
for real — see `backend/README.md`.

## Quickstart

```bash
cd frontend && npm install && npm run dev      # http://localhost:3000

cd backend && ./.venv/Scripts/pytest -v        # or set up per backend/README.md
```
