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
- **Phase 05 — Integration + Configuration**: done. Real GCS storage,
  optional Groq/OpenAI LLM adapters, optional Sentry monitoring, and a
  consolidated account-setup checklist (`backend/README.md`) for turning
  all of it on. Redis/Celery deliberately deferred — BackgroundTasks is
  correct for this MVP's scale, and the swap is a small, contained change
  whenever Redis exists, not a rewrite.
- **Frontend ↔ backend wiring**: done, in dev-mock auth mode. The API
  client sends `Authorization: Bearer dev:<creator-id>` on every request
  (matching the backend's `DevAuthVerifier` exactly), parses the backend's
  real `{"error": {"code", "message"}}` envelope, and frontend types mirror
  the backend schemas directly (no adapter layer). All five workflow steps
  that were previously stub UI — hooks, script, tanglish, storyboard,
  generate — now have real pages under `create/[projectId]/...` driving the
  actual API end to end, including polling generation status and playing
  the finished video (fetched as an authenticated blob, since the local-
  storage dev route is auth-gated and a plain `<video src>` can't attach a
  header). `next build`/`next lint` are clean, and the backend's auth layer
  and error-envelope shape were confirmed live via direct requests. Full
  in-browser pipeline verification (both creators, idea → finished video)
  is still pending a working `DATABASE_URL` — see `backend/README.md`'s
  setup checklist.

Real-provider auth (Supabase) is not wired into the frontend yet — dev-mock
auth stays the path until that's tackled as its own pass. Every phase's
hardest requirement — tenant isolation (02), the same pipeline working for
two creators (03), a verified playable final MP4 (04) — is proven by a
backend test, not just written and hoped for. FFmpeg is now installed and
those Phase 04 tests already pass for real; the ones needing the database
still skip cleanly until real Postgres+pgvector credentials exist, then run
for real too.

## Quickstart

```bash
cd frontend && npm install && npm run dev      # http://localhost:3000

cd backend && ./.venv/Scripts/pytest -v        # or set up per backend/README.md
```
