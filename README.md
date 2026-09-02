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
- **Phase 04 — Video + Audio + Rendering**: done. Per-scene video
  generation (real, playable dev-mode placeholder clips via FFmpeg while
  Veo credentials aren't configured), asset storage, FFmpeg composition
  with burned-in captions, and async job status through to a verified
  final MP4.

Frontend and backend are not yet wired together — that lands as part of
later integration phases. Each currently runs and is tested independently.
Every phase's hardest requirement — tenant isolation (02), the same
pipeline working for two creators (03), a verified playable final MP4
(04) — is proven by a backend test, not just written and hoped for.
FFmpeg is now installed and those Phase 04 tests already pass for real;
the ones needing the database still skip cleanly until Supabase
credentials exist, then run for real too — see `backend/README.md`.

## Quickstart

```bash
cd frontend && npm install && npm run dev      # http://localhost:3000

cd backend && ./.venv/Scripts/pytest -v        # or set up per backend/README.md
```
