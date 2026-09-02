# OneInfo Backend

FastAPI + PostgreSQL/pgvector backend for the OneInfo AI Video Creator.
Implements Phase 02 of the build package: auth, creator context, and
creator-scoped RAG (knowledge upload → extract → chunk → embed → retrieve).

## Stack

FastAPI · SQLAlchemy 2 (async) · Alembic · Postgres + pgvector (Supabase) ·
Pydantic v2 · Celery (structural, not yet wired to a live broker)

## Setup

```bash
py -3.13 -m venv .venv
./.venv/Scripts/pip install -e ".[dev]"    # Windows
# source .venv/bin/activate && pip install -e ".[dev]"   # macOS/Linux

cp .env.example .env
```

Fill in `.env`:
- `DATABASE_URL` — from Supabase: **Project Settings → Database → Connection
  string (URI)**. Rewrite the scheme from `postgresql://` to
  `postgresql+asyncpg://`.
- `SUPABASE_URL` / `SUPABASE_JWT_SECRET` — from **Project Settings → API**.
  Leave both blank to run in dev-mock auth mode (matches the frontend's
  Phase 01 mock auth: `Authorization: Bearer dev:creator-a` /
  `dev:creator-b`). Never leave these blank with `ENVIRONMENT=production` —
  the app refuses to start.

Run migrations (creates the `vector` extension + core tables):

```bash
./.venv/Scripts/alembic upgrade head
```

Run the API:

```bash
./.venv/Scripts/uvicorn app.main:app --reload --port 8000
```

`/health` (no DB needed) and `/docs` (Swagger UI) should respond immediately.

## Tests

```bash
./.venv/Scripts/pytest -v
```

Unit tests (chunking, dev embedding provider, auth verifier, config) run
with no external dependencies. Tests that need real Postgres+pgvector
(`tests/test_knowledge_isolation.py` — the tenant-isolation acceptance
test) **skip automatically** if `DATABASE_URL` isn't reachable, and run for
real the moment it is. That file is the actual proof of the Phase 02 gate:
*"Direct access attempts from Creator B to Creator A resources fail
safely."*

## Auth modes

- **Dev** (default until Supabase is configured): send
  `Authorization: Bearer dev:creator-a` or `dev:creator-b`. Mirrors the
  frontend's two seeded demo creators.
- **Supabase**: once `SUPABASE_JWT_SECRET` is set, the API verifies real
  Supabase access tokens and provisions a local `Creator` row from the
  token's `sub`/`email` on first request.

## Background jobs

Knowledge ingestion (extract → chunk → embed) currently runs via FastAPI's
`BackgroundTasks` — no Redis required. `app/workers/` has an equivalent
Celery task (`knowledge.process_document`) ready to swap in once Redis is
provisioned (Phase 05); both paths call the same
`process_knowledge_document` pipeline, so nothing else changes when that
swap happens.

## Embeddings

`EMBEDDING_PROVIDER=dev` (default) uses a deterministic hashed
bag-of-words embedding — no API key, good enough to prove the
storage/retrieval/isolation pipeline works, not semantically strong. Set
`EMBEDDING_PROVIDER=gemini` + `GEMINI_API_KEY` for real retrieval quality.

## Storage

`STORAGE_BACKEND=local` (default) writes uploaded files under
`./data/uploads` (gitignored). Swap for an S3/GCS/R2-backed
`StorageProvider` in Phase 05 — routes and services only depend on the
`StorageProvider` interface in `app/providers/storage/base.py`.
