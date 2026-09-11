# Speech to text

This is where the reel transcriber was worked out, and the chunking approach
in it turned out to be the part that mattered — see "Reels as knowledge" in
[`backend/README.md`](../backend/README.md#reels-as-knowledge) for why the
cut point decides whether code-switched speech survives the trip.

**The code has moved into the app.** It runs on the same stack as everything
else now: `httpx` rather than `requests`, async rather than blocking, the
app's own settings and ffmpeg runner, and the Next.js UI rather than a second
web framework standing beside it.

| What it was | Where it is now |
|---|---|
| `transcribe_reel.py` | `backend/app/providers/transcription/` and `backend/app/providers/reels.py` |
| the CLI around it | `python -m app.cli.transcribe` |
| `streamlit_app.py` | **My Knowledge → Add Knowledge → Your reels** |
| `--engine whisper` | `TRANSCRIPTION_PROVIDER=whisper` (`backend/app/providers/transcription/whisper_provider.py`) |
| `--cookies` | `INSTAGRAM_COOKIES_PATH` in `backend/.env` |
| `requirements.txt` | `backend/pyproject.toml` (Whisper is the `[whisper]` extra) |

The originals are not lost: the `speech-to-text` branch still holds them
exactly as they were pushed.

## Why it was collapsed into one implementation

Two copies of a pipeline drift the first time either is fixed, and this pair
had already started. The standalone version still resolves `yt-dlp` by bare
name on PATH — which fails for a server started without the virtualenv
activated — still trips over a reel that reports no duration, and still
offers a `mixed` / `english_chat` vocabulary the app no longer has. None of
those were wrong when written. They were just fixed on one side only, which
is what a second copy does.

Whatever you tune here should predict what the app will do, and that only
holds if it is the same code.

One thing did change in the move rather than being copied. The local Whisper
engine is now offered for English only: asked for Telugu on a real reel it
returns fluent-looking Telugu script that is not words, and it refuses rather
than returning it. In a terminal that nonsense is obvious and harmless — the
prototype was right to just print it. Filed into the knowledge layer it would
be chunked, embedded, and surfaced months later as something you supposedly
said.

## Using the CLI

From `backend/`, with its virtualenv:

```bash
python -m app.cli.transcribe "https://www.instagram.com/reel/XXXXXXXXX/"
python -m app.cli.transcribe video.mp4 --language telugu
python -m app.cli.transcribe --file sources.txt --outdir transcripts
```

`--language` takes the same three the rest of the app offers — `tenglish`
(default, spoken Telugu in Latin script), `telugu` (Telugu script), and
`english` (translated). Everything else — the API key, the chunk lengths,
the silence threshold, which ffmpeg to use — is read from `backend/.env`, so
a run here is the run the server would have done.

Set `TRANSCRIPTION_PROVIDER=sarvam` and `SARVAM_API_KEY` there, or the CLI
says plainly that it is producing a `[DEV MODE]` placeholder.
