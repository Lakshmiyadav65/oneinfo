# OneInfo Backend

FastAPI + PostgreSQL/pgvector backend for the OneInfo AI Video Creator.

- **Phase 02**: auth, creator context, creator-scoped RAG (knowledge upload
  → extract → chunk → embed → retrieve).
- **Phase 03**: the content pipeline — idea → hooks → script → Tanglish
  (optional) → storyboard, each step backed by a structured agent, RAG
  context, and human approval gates.
- **Phase 04**: turns an approved storyboard into a playable final MP4 —
  per-scene video generation, asset storage, FFmpeg composition with
  burned-in captions, and async job status.
- **Phase 05**: real-provider wiring — GCS storage, optional Groq/OpenAI
  LLM adapters, optional Sentry monitoring — plus the account-by-account
  checklist for actually turning all of this on.

## Stack

FastAPI · SQLAlchemy 2 (async) · Alembic · Postgres + pgvector (Supabase) ·
Pydantic v2 · FFmpeg · Celery (structural, not yet wired to a live broker) ·
Gemini/Veo/GCS via `google-auth`/`google-cloud-storage`, Groq/OpenAI as
optional adapters, Sentry (optional, no-op until `SENTRY_DSN` is set)

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

FFmpeg is required (even in dev mode — see "Video generation" below).
Either install it and leave `FFMPEG_PATH=ffmpeg` / `FFPROBE_PATH=ffprobe`
in `.env`, or download a portable build and point those two at its
`ffmpeg.exe`/`ffprobe.exe`:

```bash
curl -L -o tools/ffmpeg.zip https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl-shared.zip
# unzip into tools/, then set FFMPEG_PATH/FFPROBE_PATH in .env to its bin/ffmpeg.exe and bin/ffprobe.exe
```

(`tools/` is gitignored — this is a local machine setup step, not something
committed. gyan.dev's build is the other option ffmpeg.org itself lists for
Windows, but its downloads have been extremely slow from this environment;
GitHub's release CDN was ~5MB/s vs <100KB/s.)

Run the API:

```bash
./.venv/Scripts/uvicorn app.main:app --reload --port 8000
```

`/health` (no DB needed) and `/docs` (Swagger UI) should respond immediately.

## Tests

```bash
./.venv/Scripts/pytest -v
```

Unit tests (chunking, dev embedding/LLM providers, QA agent, auth verifier,
config) run with no external dependencies.

> **The DB-backed tests are destructive.** They truncate `creators` between
> cases — which cascades to every project, script, storyboard and video — and
> they seed `creator-a`/`creator-b`, the same ids dev-mock auth uses, so
> there's no way to clean up "only test rows". They therefore run **only**
> against a separate `TEST_DATABASE_URL`, and refuse to start if it matches
> `DATABASE_URL`. Leave it unset and they skip. This is not optional
> paranoia: pointing them at the app's database wipes real work.

The tests that need real Postgres+pgvector, once `TEST_DATABASE_URL` is set:
- `tests/test_knowledge_isolation.py` — the Phase 02 gate: *"Direct access
  attempts from Creator B to Creator A resources fail safely."*
- `tests/test_content_pipeline.py` — the Phase 03 gate: *"A project can
  progress from idea to approved storyboard using the same pipeline for
  Creator A and Creator B,"* plus cross-creator project isolation, the
  approved-content version-protection rule, and the optional-Tanglish path.
- `tests/test_generation_pipeline.py` — the Phase 04 gate: *"At least one
  complete project produces a playable final MP4,"* plus output isolation
  and the duplicate-job guard.

Tests that need FFmpeg but not the database (`test_video_dev_provider.py`,
`test_rendering_service.py`) skip the same way if `FFMPEG_PATH`/
`FFPROBE_PATH` aren't resolvable, and otherwise actually run FFmpeg and
assert on the real output (playable, correct duration) — not mocked.

## Migrations

`alembic upgrade head` after pulling anything that changed a model. Skipping
it is unusually painful here: SQLAlchemy selects every mapped column, so one
un-run migration makes *every* request touching that table fail with a
generic 500 at once — the document list, the viewer and the reel routes all
broke together and none of them said why.

So the server checks at startup. Behind, and it logs the exact command to
run; behind in production, and it refuses to start, the same split
`validate_for_startup` makes for dev-mock auth. A database it cannot reach
is not treated as a mismatch — that would turn a blip into a failure to boot.

## Auth modes

- **Dev** (default until Supabase is configured): send
  `Authorization: Bearer dev:creator-a` or `dev:creator-b`. Mirrors the
  frontend's two seeded demo creators.
- **Supabase**: once `SUPABASE_JWT_SECRET` is set, the API verifies real
  Supabase access tokens and provisions a local `Creator` row from the
  token's `sub`/`email` on first request.

## Background jobs

Knowledge ingestion (extract → chunk → embed) and video generation both
currently run via FastAPI's `BackgroundTasks` — no Redis required. This is
a deliberate Phase 05 decision, not a gap: Docker isn't available in this
dev environment and Redis doesn't run natively on Windows, and
BackgroundTasks is genuinely correct for this MVP's scale (not 10,000
concurrent creators). `app/workers/` has equivalent Celery tasks
(`knowledge.process_document`) ready to swap in once Redis is provisioned
— both paths call the same pipeline functions, so switching is a small,
contained change (swap `background_tasks.add_task(...)` for `.delay(...)`
at two call sites), not a rewrite.

**Known, accepted limitation**: `generation_service.start_generation`'s
duplicate-job guard (an existing queued/processing job short-circuits a new
`POST /generate` instead of starting another) is a check-then-act read
followed by a write, with no DB-level lock. Two genuinely simultaneous
requests could both pass the check before either commits, creating two
jobs. In practice the frontend's Generate button disables itself after the
first click, so the realistic trigger (a careless double-click) is already
closed off; only a true race (two tabs, a retry) could still hit it. Not
hardened with a lock/unique-constraint for this MVP pass — same
scale-appropriate judgment call as the Redis/Celery deferral above, not an
oversight. `tests/test_generation_pipeline.py` notes why this specific race
isn't exercised by its test client (httpx's `ASGITransport` runs
`BackgroundTasks` to completion before `client.post()` returns, so
sequential calls can't observe an in-flight job to test the guard against).

## Embeddings

`EMBEDDING_PROVIDER=dev` (default) uses a deterministic hashed
bag-of-words embedding — no API key, good enough to prove the
storage/retrieval/isolation pipeline works, not semantically strong. Set
`EMBEDDING_PROVIDER=gemini` + `GEMINI_API_KEY`, or `EMBEDDING_PROVIDER=openai`
+ `OPENAI_API_KEY`, for real retrieval quality.

## Storage

`STORAGE_BACKEND=local` (default) writes uploaded files under
`./data/uploads` (gitignored) — fine for dev, not durable/shared. Set
`STORAGE_BACKEND=gcs` + `STORAGE_BUCKET` + `GOOGLE_APPLICATION_CREDENTIALS`
for real Google Cloud Storage (the master spec's preferred backend, given
the team's existing Google Cloud startup credits) — routes and services
only depend on the `StorageProvider` interface in
`app/providers/storage/base.py`, so nothing above that layer changes.
`GCSStorageProvider.get_url()` returns a real signed URL, so
`GET /projects/{id}/output`'s local-storage proxy route is bypassed
entirely once this is on.

## Reels as knowledge

My Knowledge assumes a creator has something written down to give it. Many
have nothing written and a year of reels instead, so `POST /knowledge/reels`
(links) and `POST /knowledge/video` (a file) transcribe what they said on
camera and file it as ordinary knowledge documents — chunked, embedded and
retrieved exactly like a pasted chat.

`TRANSCRIPTION_PROVIDER=dev` (default) produces a placeholder transcript
marked `[DEV MODE]`, which exercises download → extract → chunk → embed
without spending anything. `TRANSCRIPTION_PROVIDER=sarvam` + `SARVAM_API_KEY`
(the same key the voice uses) is the one that handles Telugu and English in
the same sentence.

`TRANSCRIPTION_PROVIDER=whisper` is the third, carried over from the
prototype: it runs on this machine, needs no key and no network, and the
audio never leaves the server. It is offered for **English only**, which is
measured rather than assumed — on a real Telugu reel it returns fluent-looking
Telugu script that is not words, while translating the same audio gives a
usable English rendering. It refuses `telugu` and `tenglish` outright rather
than filing nonsense that would be chunked, embedded and surfaced months
later as something the creator supposedly said. Needs
`pip install -e .[whisper]`, which pulls a few hundred megabytes of inference
runtime that the Sarvam path does not.

A private or age-gated reel is served only to a signed-in account. Point
`INSTAGRAM_COOKIES_PATH` at your own exported `cookies.txt` and those
download too; the error message says so when one is refused, and says the
session has expired instead when cookies were sent and still turned away.
Cookies are read from disk on the server and never accepted over the API — a
cookie jar is a live login, and taking one through a form would mean storing
other people's sessions.

A transcript is written in one of the project languages — English, Tenglish,
Telugu — and deliberately not in a vocabulary of its own. The transcript is
what the script agents later write from, so it is the same question Create
Video asks, asked once; `TRANSCRIPT_LANGUAGES` in
`providers/transcription/base.py` maps each onto a Sarvam mode, and a test
pins that set equal to the project languages so the two cannot drift. Unasked,
a reel follows the creator's most recent project, the same guess a new project
makes.

A transcript is editable, because speech models get names wrong in a
particular way: not randomly, but identically at every mention — a product
said quickly comes back as the nearest thing the model has heard before, and
comes back that way each time. `PATCH /knowledge/{id}` saves the correction
and re-runs the same ingestion pipeline, which replaces the stored chunks
rather than adding to them (otherwise retrieval would answer from both the
correction and the mistake). For a transcript the summary is rewritten too,
since there it *is* the transcript; a link's model-written takeaways are left
alone. `POST /knowledge/{id}/retranscribe` reads a reel again in another
language, and is refused for an uploaded video — only the transcript was
kept, so there is nothing to read.

Two of those mappings are not the obvious one:

- **Tenglish is `translit`, not `transcribe`.** The app defines Tenglish as
  spoken Telugu written in Latin script (`models/tanglish.py`, and every
  agent prompt). Transliteration produces exactly that; transcription would
  return Telugu script and make the same word mean two different things in
  two places.
- **English is `translate`, not `transcribe`.** Asked to transcribe Telugu
  speech as `en-IN`, the model ignores the code and returns Telugu script
  anyway — a creator picking English got a Telugu document. Translate
  honours the choice whatever the reel was spoken in.

Two more things are worth knowing before changing anything here:

- **The cut is the whole game.** `providers/transcription/audio.py` cuts the
  audio at the *first pause after* `TRANSCRIPTION_MIN_CHUNK_SECONDS`, not at
  a target length. Language detection picks one language per request, so a
  chunk that spans the pause between a Telugu sentence and an English one
  comes back written entirely in whichever the model thought was dominant.
  If whole sentences land in the wrong script, that is the knob — lower MIN,
  and raise `TRANSCRIPTION_SILENCE_DB` toward `-25` if background music is
  masking the pauses.
- **The video is never stored.** Only the transcript is kept. An uploaded
  file is spooled to disk, transcribed, and deleted; a downloaded reel lives
  in a temp directory for the length of the request. `MAX_VIDEO_BYTES` bounds
  what one request touches, not what is retained.

`yt-dlp` is installed with the backend's dependencies and shells out as a
CLI. Instagram changes its internals often, so it is the dependency most
likely to need upgrading alone (`pip install -U yt-dlp`) when downloads
start failing for no other reason. Without it on PATH, links fail with that
as the message and uploading the file still works. A private or age-gated
reel cannot be downloaded at all — the error says so and points at the
upload.

There is one implementation of this pipeline and everything uses it. The
terminal entry point is `python -m app.cli.transcribe` (see
`app/cli/transcribe.py`), which imports the same providers the routes above
do — so tuning a language or a chunk length against a real video predicts
what the server will do, rather than approximating it.

It began as a standalone tool — `requests`, Streamlit, its own env-var
config — and that version is still on the `speech-to-text` branch if it is
ever wanted. It was collapsed into this one rather than kept alongside it
because the two had already drifted: the same yt-dlp lookup, duration
parsing and language vocabulary were fixed here and not there, which is what
a second copy of a pipeline does the first time either side is touched.

## Content agents (Phase 03)

`LLM_PROVIDER=dev` (default) uses a deterministic templated provider — no
API key, schema-valid, clearly marked `[DEV MODE]` output, good enough to
exercise and test the full pipeline. Set `LLM_PROVIDER=gemini` +
`GEMINI_API_KEY` for real creative output, or `LLM_PROVIDER=groq` /
`LLM_PROVIDER=openai` (+ the matching API key) for the master spec's
optional fast/low-cost and fallback providers — both are OpenAI-compatible
chat-completions APIs, sharing one `OpenAICompatibleLLMProvider`
implementation that only differs by base URL and default model.

Pipeline: `POST /projects` → `POST /projects/{id}/hooks/generate` → select
a hook → `POST /projects/{id}/script/generate` → approve → optionally
`POST /projects/{id}/tanglish/generate` → approve →
`POST /projects/{id}/storyboard/generate`. Approved script/Tanglish content
is versioned, never overwritten in place — regenerating after approval
creates a new version instead. The QA Agent runs automatically at the end
of storyboard generation (structural validation only — scene coverage,
missing voiceover/visuals, implausible durations — never rewrites
content) and its result is returned inline on the storyboard response.

Not wired into the frontend yet — verified via `tests/test_content_pipeline.py`
against the API directly, same pattern as Phase 02. Frontend integration is
later-phase work.

## Video generation (Phase 04)

`VIDEO_PROVIDER=dev` (default) renders each scene as a real, playable
placeholder clip locally via FFmpeg (solid color + the visual_prompt text)
instead of calling Veo — no Google Cloud credentials needed, and it proves
the full asset/storage/render pipeline end-to-end. Set `VIDEO_PROVIDER=veo`
+ `GOOGLE_CLOUD_PROJECT` + `GOOGLE_APPLICATION_CREDENTIALS` (a service
account JSON with Vertex AI access) for real generated video. Unlike the
Gemini providers, this genuinely needs FFmpeg installed even in dev mode —
see Setup above.

Pipeline: `POST /projects/{id}/generate` creates a job and returns
immediately (repeated clicks return the same in-flight job rather than
starting a duplicate — the idempotency/duplicate-job guard); a background
task generates each storyboard scene, stores it as an `Asset`, then
`rendering_service` normalizes every clip, burns in its caption via FFmpeg
`drawtext` (this happens uniformly here regardless of video source — real
Veo output needs the same caption pass, so it doesn't belong in the video
provider), and concatenates them into one final MP4, verified non-empty
with a plausible probed duration before being marked complete. Poll
`GET /projects/{id}/generation` for status, then
`GET /projects/{id}/output` for playback metadata (its `url` proxies
through `GET /projects/{id}/output/file` for local storage, since that has
no public URL — a real StorageProvider would return a signed URL directly
here instead).

Same verification pattern as every other phase: `tests/test_generation_pipeline.py`
is the actual proof of the gate and needs both FFmpeg and the database;
`tests/test_video_dev_provider.py` and `tests/test_rendering_service.py`
only need FFmpeg and already pass for real in this environment.

## Real provider setup checklist (Phase 05)

Everything above works today in dev mode with zero external accounts.
This is the checklist for turning on the real thing — every step here is
something only you can do (account creation, billing, credential
generation); once you have the values, drop them into `.env` and the code
picks them up with no further changes.

1. **Supabase** — create a project at supabase.com. Get `DATABASE_URL`
   from *Project Settings → Database → Connection string*, and
   `SUPABASE_URL` / `SUPABASE_JWT_SECRET` from *Project Settings → API*.
   Unblocks: real auth, and every DB-dependent test in this project
   (`test_knowledge_isolation.py`, `test_content_pipeline.py`,
   `test_generation_pipeline.py`) — right now they all skip cleanly for
   exactly this reason.

   Set only `DATABASE_URL` first if you just want the database (pgvector
   included) without switching auth modes yet — setting `SUPABASE_URL` /
   `SUPABASE_JWT_SECRET` flips the backend from dev-mock auth
   (`dev:creator-a` / `dev:creator-b`) to verifying real Supabase tokens,
   and the frontend isn't wired for that yet (still on dev-mock auth as of
   the frontend↔backend wiring pass — see root `README.md`).

   A local native Postgres is **not** a good substitute here on Windows:
   this was tried and hit a real wall — a locally installed
   `postgresql-x64-18` service has no path to `pgvector` without building
   it from source with MSVC (no official Windows binaries exist). Supabase
   ships pgvector already enabled, which is the whole reason it's the
   documented path rather than "install Postgres locally."
2. **Google Cloud** — use the team's existing Google for Startups credits
   (per the master spec, don't open a second billing account). Create/use
   project `OneInfo-AI-Video-MVP`, enable the Vertex AI and Cloud Storage
   APIs, create a service account with Vertex AI User + Storage Object
   Admin roles, download its JSON key. Set `GOOGLE_CLOUD_PROJECT` and
   `GOOGLE_APPLICATION_CREDENTIALS` (path to that JSON) in `.env`. This
   one service account covers three things:
   - `GEMINI_API_KEY` (from Google AI Studio, or Vertex AI's Gemini
     endpoint if you'd rather stay entirely inside the GCP project) +
     `LLM_PROVIDER=gemini` / `EMBEDDING_PROVIDER=gemini`.
   - `VIDEO_PROVIDER=veo` — confirm Veo access is enabled for the project
     first; it's been a gated/preview API.
   - `STORAGE_BACKEND=gcs` + `STORAGE_BUCKET=<a bucket you create in that
     project>`.
3. **Optional — Groq** (`GROQ_API_KEY` from console.groq.com) and/or
   **OpenAI** (`OPENAI_API_KEY` from platform.openai.com) if you want a
   fast/cheap or fallback LLM alongside Gemini.
4. **Optional — Sentry** (`SENTRY_DSN` from a Sentry project) for error
   monitoring. No-op until set.

Nothing here is required to keep developing — every piece has a working
dev-mode fallback — but #1 is the one actually blocking this project's
hardest-requirement tests from running for real.
