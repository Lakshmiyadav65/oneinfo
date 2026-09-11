# Video Transcriber

Takes a video — an Instagram Reel URL, or the path to any local video file — and outputs a
text transcript ("script") of the spoken audio.

You choose how mixed Telugu/English speech should be written out, via `--script-style`
(or the sidebar radio in the Streamlit UI):

| Style | What you get | Example |
|---|---|---|
| `mixed` (default) | Telugu + English, each word in its own script | `నాకు phone number కావాలి` |
| `english_chat` | Everything in English/Roman letters, Telugu spelled phonetically — chat-style | `naaku phone number kaavaali` |
| `telugu` | Everything normalized into Telugu script, including English words | `నాకు ఫోన్ నంబర్ కావాలి` |

## How it works
1. **Get the video** — `yt-dlp` downloads it if you pass a URL; a local file path is used as-is.
2. **Extract audio** — `ffmpeg` converts it to mono 16kHz WAV.
3. **Chunk on silence** — the audio is split into short pieces at natural pauses (not mid-word),
   since Sarvam's real-time API tops out around 30 seconds per request.
4. **Transcribe** — each chunk is sent to the [Sarvam AI Speech-to-Text API](https://docs.sarvam.ai/)
   using the Sarvam `mode`/`language_code` implied by your chosen `--script-style` (see the table
   above, and `SCRIPT_STYLES` in `transcribe_reel.py` for the exact mapping).
5. **Save** — chunk transcripts are stitched back together in order into a plain `.txt` script,
   plus a `.json` with per-chunk timestamps and detected language codes.

A local **faster-whisper** engine (`--engine whisper`) is also available if you'd rather
transcribe without an API key or network call — no code-switch handling there, though.

## Setup

```bash
# 1. System dependency (ffmpeg + ffprobe)
# macOS:   brew install ffmpeg
# Ubuntu:  sudo apt install ffmpeg
# Windows: choco install ffmpeg   (or download from ffmpeg.org)

# 2. Python dependencies
pip install -r requirements.txt

# 3. Sarvam API key (get one at https://dashboard.sarvam.ai/)
export SARVAM_API_KEY="your_key_here"          # macOS/Linux
$env:SARVAM_API_KEY = "your_key_here"          # Windows PowerShell
```

## Usage

Local video file:
```bash
python transcribe_reel.py "path/to/video.mp4"
```

Instagram Reel URL:
```bash
python transcribe_reel.py "https://www.instagram.com/reel/XXXXXXXXXXX/"
```

Batch (one URL or file path per line in a text file):
```bash
python transcribe_reel.py --file sources.txt
```

Options:
```bash
python transcribe_reel.py "video.mp4" \
  --outdir my_scripts \        # where transcripts get saved
  --script-style mixed \       # mixed (default) / english_chat / telugu — see table above
  --min-chunk-seconds 1 \      # don't cut a chunk shorter than this even if a pause shows up sooner
  --max-chunk-seconds 25 \     # hard cap per chunk, to stay under Sarvam's ~30s request limit
  --silence-db -30 \           # loudness (dB) below which audio counts as a pause
  --silence-min-dur 0.3 \      # minimum pause length (seconds) that counts as a cut point
  --cookies cookies.txt \      # only for private/logged-in Instagram content you have rights to
  --keep-media                 # also save the downloaded video (URL sources only)

# Or run fully local, no API key:
python transcribe_reel.py "video.mp4" --engine whisper --whisper-model small
```

`--stt-mode` and `--language-code` still exist as advanced overrides if you need to bypass what
`--script-style` picks (e.g. force `language_code=en-IN`), but normally you shouldn't need them.

### If a script style isn't giving you what you expect

1. **Getting `mixed`-style output but want everything forced into one script** — you probably want
   a different `--script-style` (`telugu` forces Telugu script including English words;
   `english_chat` forces Roman letters for everything).
2. **`mixed` style still puts a whole sentence in the wrong script** — this means a chunk swallowed
   more than one utterance/language. Tighten the chunking: lower `--min-chunk-seconds` (e.g. to
   `0.5`), and loosen `--silence-db` toward `-25` / lower `--silence-min-dur` toward `0.2` if
   background music/noise is masking the pauses between sentences.

Either way, check the `.json` output's `segments` — each has `start`/`end`/`language_code`/`text`.
If a segment's `text` is wrong, its time range tells you exactly where to focus.

Output per video:
- `transcripts/<id>.txt` — the plain script, one chunk/sentence per line, ready to copy/paste
- `transcripts/<id>.json` — full text + per-chunk `start`, `end`, `language_code`, and `text`

## Web UI (Streamlit)

A simple browser UI is included so you don't need the command line day-to-day:

```bash
.\.venv\Scripts\python.exe -m streamlit run streamlit_app.py
```

This opens a local page where you can:
- Upload a video file (or paste a Reel URL, with an optional `cookies.txt`)
- Enter your Sarvam API key (pre-filled if `SARVAM_API_KEY` is already set) or switch to the local Whisper engine
- Hit **Transcribe**, watch live progress per chunk, then read/download the resulting `.txt`/`.json`

It calls the exact same `process_source()` pipeline as the CLI — same chunking, same Sarvam call, same output files under `transcripts/` — just with a UI on top.

## Notes on the Sarvam integration

- Endpoint: `POST https://api.sarvam.ai/speech-to-text`, auth via the `api-subscription-key` header.
- `--script-style` picks the `mode`/`language_code` pair sent to Sarvam (see `SCRIPT_STYLES` in
  `transcribe_reel.py`): `mixed` → `mode=codemix`, `english_chat` → `mode=translit`,
  `telugu` → `mode=transcribe, language_code=te-IN`. `codemix`/`translit` use
  `language_code=unknown` so Sarvam auto-detects per chunk.
- Sarvam's model lineup and parameters change from time to time; if the API starts rejecting
  requests, check the current docs at https://docs.sarvam.ai/ and adjust `--sarvam-model` /
  `--stt-mode` / `--language-code` accordingly.
- The real-time endpoint is meant for short audio (documented around 30s/request), which is why
  this tool chunks first. For very long source videos, Sarvam also offers a batch API (up to ~2
  hours/file with speaker diarization) — not wired up here, but a reasonable next step if needed.

## Important notes

- **Instagram's terms of service** restrict automated scraping/downloading of content. This works
  technically via `yt-dlp`, but using it at scale, on content you don't own, or against Instagram's
  ToS carries account/legal risk — that's on you to evaluate for your use case (e.g., transcribing
  your own reels, or reels you have explicit permission to use, is the safe case).
- **Reliability**: Instagram frequently changes its internals, which can break `yt-dlp` until it's
  updated (`pip install -U yt-dlp` if downloads start failing).
- **Silence-based chunking**: if a chunk has no clear pause near the target length (e.g. continuous
  speech with no gaps), the tool falls back to a hard cut at the max chunk length — this can very
  occasionally split a sentence across two chunks.
