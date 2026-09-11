#!/usr/bin/env python3
"""
video-transcriber
------------------
Takes a video (an Instagram Reel URL, or the path to any local video file)
and outputs a text transcript ("script") of the spoken audio.

If the audio switches languages — whole sentences, or even individual words
mixed within a sentence — the transcript preserves that: Telugu words/sentences
come out in Telugu script, English words/sentences come out in English. No
forced translation or transliteration of either into the other's script.

Pipeline:
  1. Get the video — download it (yt-dlp) if given a URL, or use the local
     file directly if given a path.
  2. Extract the audio track with ffmpeg.
  3. Split the audio into short chunks on natural pauses (silence), since
     Sarvam's real-time speech-to-text endpoint caps out around 30s/request.
  4. Transcribe each chunk with the Sarvam AI Speech-to-Text API
     (https://api.sarvam.ai/speech-to-text). --script-style picks how mixed
     speech is written out: 'mixed' (default, each word in its own script),
     'english_chat' (everything in Roman letters, chat-style), or 'telugu'
     (everything normalized into Telugu script). See SCRIPT_STYLES below.
  5. Stitch the chunk transcripts back together in order and save the script.

  A local faster-whisper engine is also available (--engine whisper) if you
  want to transcribe without an API key/network call.

Usage:
  set SARVAM_API_KEY=your_key_here            (PowerShell: $env:SARVAM_API_KEY="...")
  python transcribe_reel.py "path\\to\\video.mp4"
  python transcribe_reel.py "https://www.instagram.com/reel/XXXXXXXX/"
  python transcribe_reel.py --file sources.txt --outdir transcripts
  python transcribe_reel.py "video.mp4" --engine whisper --whisper-model small

Requirements: see requirements.txt (pip install -r requirements.txt)
You also need ffmpeg (with ffprobe) installed on the system (not just the pip package).
"""

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from datetime import datetime

import requests

SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"

# User-facing output styles for mixed Telugu/English speech, mapped to the underlying
# Sarvam (mode, language_code) pair. Keeps the CLI/UI in plain language instead of
# making everyone learn Sarvam's mode names.
SCRIPT_STYLES = {
    "mixed": {
        "label": "Telugu + English (each word in its own script)",
        "mode": "codemix",
        "language_code": "unknown",
    },
    "english_chat": {
        "label": "English letters only (Telugu words spelled phonetically, chat-style)",
        "mode": "translit",
        "language_code": "unknown",
    },
    "telugu": {
        "label": "Complete Telugu (everything normalized into Telugu script)",
        "mode": "transcribe",
        "language_code": "te-IN",
    },
}


def log(msg: str):
    print(f"[{datetime.now().strftime('%H:%M:%S')}] {msg}", file=sys.stderr)


def is_url(source: str) -> bool:
    return re.match(r"^https?://", source.strip(), re.I) is not None


def download_reel(url: str, workdir: Path, cookies: str | None = None) -> Path:
    """Download a video (e.g. an Instagram Reel) using yt-dlp. Returns path to the downloaded file."""
    out_template = str(workdir / "%(id)s.%(ext)s")
    cmd = [
        "yt-dlp",
        "-f", "mp4/best",
        "-o", out_template,
        "--no-playlist",
        "--print", "after_move:filepath",
        url,
    ]
    if cookies:
        cmd.extend(["--cookies", cookies])

    log(f"Downloading: {url}")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"yt-dlp failed for {url}:\n{result.stderr.strip()}")

    filepath = result.stdout.strip().splitlines()[-1]
    return Path(filepath)


def extract_audio(video_path: Path, workdir: Path) -> Path:
    """Extract mono 16kHz WAV audio from the video."""
    audio_path = workdir / (video_path.stem + ".wav")
    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-vn",
        "-ac", "1",
        "-ar", "16000",
        "-loglevel", "error",
        str(audio_path),
    ]
    log("Extracting audio...")
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed:\n{result.stderr.strip()}")
    return audio_path


def get_audio_duration(audio_path: Path) -> float:
    cmd = ["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(audio_path)]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffprobe failed:\n{result.stderr.strip()}")
    return float(result.stdout.strip())


def detect_silences(audio_path: Path, noise_db: int = -35, min_silence: float = 0.4) -> list[tuple[float, float]]:
    """Return a list of (start, end) silence intervals in the audio, via ffmpeg's silencedetect filter."""
    cmd = [
        "ffmpeg", "-i", str(audio_path),
        "-af", f"silencedetect=noise={noise_db}dB:d={min_silence}",
        "-f", "null", "-",
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    silences = []
    start = None
    for line in result.stderr.splitlines():
        m = re.search(r"silence_start:\s*([\d.]+)", line)
        if m:
            start = float(m.group(1))
            continue
        m = re.search(r"silence_end:\s*([\d.]+)", line)
        if m and start is not None:
            silences.append((start, float(m.group(1))))
            start = None
    return silences


def plan_chunk_cuts(duration: float, silences: list[tuple[float, float]], min_len: float, max_len: float) -> list[float]:
    """Pick interior cut points (seconds) so each chunk is (as much as possible) a single utterance.

    Cuts at the *first* natural pause after min_len from the start of the current chunk, rather than
    aiming for some target length — that matters a lot for code-switched audio: if you instead wait
    for a target duration before looking for a pause, you can sail straight past the actual pause
    between a Telugu sentence and an English one and lump both into one chunk. Since Sarvam's
    language auto-detection picks one language per request, a chunk spanning two languages gets
    transcribed entirely in whichever one it decided was dominant — which is exactly the "English
    came back as Telugu" symptom. Cutting at the nearest pause keeps chunks (and language switches)
    isolated. max_len is only a safety net for stretches with no detected pause at all."""
    if duration <= max_len:
        return []

    cuts = []
    pos = 0.0
    while duration - pos > max_len:
        window_lo = pos + min_len
        window_hi = pos + max_len
        candidates = [(s + e) / 2 for (s, e) in silences if window_lo <= (s + e) / 2 <= window_hi]
        cut = min(candidates) if candidates else window_hi
        cut = min(round(cut, 3), duration)
        cuts.append(cut)
        pos = cut
    return cuts


def split_audio(audio_path: Path, workdir: Path, cuts: list[float]) -> list[Path]:
    """Physically split audio at the given cut points. Returns chunk paths in order."""
    if not cuts:
        return [audio_path]

    pattern = workdir / "chunk_%04d.wav"
    cmd = [
        "ffmpeg", "-y",
        "-i", str(audio_path),
        "-f", "segment",
        "-segment_times", ",".join(str(c) for c in cuts),
        "-c", "copy",
        "-reset_timestamps", "1",
        "-loglevel", "error",
        str(pattern),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg segment split failed:\n{result.stderr.strip()}")
    return sorted(workdir.glob("chunk_*.wav"))


def transcribe_chunk_sarvam(chunk_path: Path, api_key: str, model: str, mode: str | None, language_code: str, timeout: int = 60) -> dict:
    """Send one audio chunk to the Sarvam AI speech-to-text API. Retries transient failures."""
    headers = {"api-subscription-key": api_key}
    data = {"model": model, "language_code": language_code}
    if mode:
        data["mode"] = mode

    last_err = None
    for attempt in range(1, 4):
        try:
            with open(chunk_path, "rb") as f:
                files = {"file": (chunk_path.name, f, "audio/wav")}
                resp = requests.post(SARVAM_STT_URL, headers=headers, data=data, files=files, timeout=timeout)
        except requests.RequestException as e:
            last_err = str(e)
            time.sleep(2 ** attempt)
            continue

        if resp.status_code == 200:
            return resp.json()
        if resp.status_code == 429 or resp.status_code >= 500:
            last_err = f"HTTP {resp.status_code}: {resp.text[:300]}"
            time.sleep(2 ** attempt)
            continue
        raise RuntimeError(f"Sarvam API error {resp.status_code} for {chunk_path.name}: {resp.text[:500]}")

    raise RuntimeError(f"Sarvam API failed for {chunk_path.name} after retries: {last_err}")


def transcribe_audio_sarvam(
    audio_path: Path,
    workdir: Path,
    api_key: str,
    model: str,
    mode: str | None,
    language_code: str,
    min_chunk_len: float = 1.0,
    max_chunk_len: float = 25.0,
    silence_db: int = -30,
    silence_min_dur: float = 0.3,
    on_progress=None,
) -> dict:
    """Transcribe audio via the Sarvam API, chunked on silence. Each chunk keeps its own
    detected language/script, so mixed Telugu/English audio comes back mixed correctly —
    as long as a chunk doesn't itself straddle two languages (see plan_chunk_cuts).
    on_progress, if given, is called with a short status string after each chunk starts."""
    duration = get_audio_duration(audio_path)
    silences = detect_silences(audio_path, noise_db=silence_db, min_silence=silence_min_dur) if duration > max_chunk_len else []
    cuts = plan_chunk_cuts(duration, silences, min_chunk_len, max_chunk_len)
    chunk_paths = split_audio(audio_path, workdir, cuts)
    boundaries = [0.0] + cuts + [duration]

    segments = []
    lang_codes = []
    for i, chunk_path in enumerate(chunk_paths):
        msg = f"Transcribing chunk {i + 1}/{len(chunk_paths)} ({boundaries[i]:.1f}s - {boundaries[i + 1]:.1f}s)..."
        log(msg)
        if on_progress:
            on_progress(msg)
        result = transcribe_chunk_sarvam(chunk_path, api_key, model, mode, language_code)
        text = (result.get("transcript") or "").strip()
        code = result.get("language_code") or "unknown"
        lang_codes.append(code)
        segments.append({
            "start": round(boundaries[i], 2),
            "end": round(boundaries[i + 1], 2),
            "language_code": code,
            "text": text,
        })

    distinct = sorted({c for c in lang_codes if c and c != "unknown"})
    if len(distinct) == 1:
        overall_lang = distinct[0]
    elif distinct:
        overall_lang = "mixed (" + ", ".join(distinct) + ")"
    else:
        overall_lang = "unknown"

    full_text = "\n".join(s["text"] for s in segments if s["text"])

    return {
        "engine": "sarvam",
        "model": model,
        "language": overall_lang,
        "text": full_text,
        "segments": segments,
    }


def transcribe_audio_whisper(audio_path: Path, model_size: str = "small", language: str | None = None) -> dict:
    """Transcribe audio locally using faster-whisper. Returns dict with text + segments."""
    from faster_whisper import WhisperModel

    log(f"Loading whisper model '{model_size}' (first run downloads weights, then it's cached)...")
    model = WhisperModel(model_size, device="cpu", compute_type="int8")

    log("Transcribing...")
    segments, info = model.transcribe(str(audio_path), language=language, vad_filter=True)

    full_text_parts = []
    segment_list = []
    for seg in segments:
        full_text_parts.append(seg.text.strip())
        segment_list.append({
            "start": round(seg.start, 2),
            "end": round(seg.end, 2),
            "text": seg.text.strip(),
        })

    return {
        "engine": "whisper",
        "model": model_size,
        "language": info.language,
        "language_probability": round(info.language_probability, 3),
        "text": "\n".join(full_text_parts).strip(),
        "segments": segment_list,
    }


def process_source(source: str, outdir: Path, engine: str, cookies: str | None, keep_media: bool, sarvam_opts: dict, whisper_model: str, on_progress=None) -> dict:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)

        if is_url(source):
            if on_progress:
                on_progress(f"Downloading {source}...")
            video_path = download_reel(source, tmp_path, cookies=cookies)
        else:
            video_path = Path(source)
            if not video_path.exists():
                raise FileNotFoundError(f"Local video file not found: {source}")

        source_id = video_path.stem
        if on_progress:
            on_progress("Extracting audio...")
        audio_path = extract_audio(video_path, tmp_path)

        if engine == "sarvam":
            result = transcribe_audio_sarvam(audio_path, tmp_path, on_progress=on_progress, **sarvam_opts)
        else:
            if on_progress:
                on_progress(f"Loading whisper model '{whisper_model}' and transcribing (this can take a bit)...")
            result = transcribe_audio_whisper(audio_path, model_size=whisper_model)

        result["source"] = source
        result["source_id"] = source_id

        outdir.mkdir(parents=True, exist_ok=True)
        base = outdir / source_id

        # Plain script (just the words, easiest to read/reuse)
        base.with_suffix(".txt").write_text(result["text"] + "\n", encoding="utf-8")

        # Full JSON with per-chunk detail, for anything programmatic.
        # ensure_ascii=False so Telugu (and other non-Latin) text is stored as real characters, not \uXXXX escapes.
        base.with_suffix(".json").write_text(json.dumps(result, indent=2, ensure_ascii=False), encoding="utf-8")

        if keep_media and is_url(source):
            kept_video = outdir / video_path.name
            kept_video.write_bytes(video_path.read_bytes())

        log(f"Saved: {base}.txt  and  {base}.json")
        return result


def main():
    parser = argparse.ArgumentParser(description="Transcribe audio from a video (Reel URL or local file) into a text script.")
    src = parser.add_mutually_exclusive_group(required=True)
    src.add_argument("source", nargs="?", help="An Instagram Reel URL, or the path to a local video file")
    src.add_argument("--file", "-f", help="Path to a text file with one URL/file path per line")

    parser.add_argument("--outdir", "-o", default="transcripts", help="Directory to save transcripts (default: transcripts/)")
    parser.add_argument("--engine", choices=["sarvam", "whisper"], default="sarvam",
                         help="Transcription engine: 'sarvam' (Sarvam AI API, default, best for Telugu/English) or 'whisper' (local, no API key needed)")

    sarvam = parser.add_argument_group("Sarvam engine options")
    sarvam.add_argument("--api-key", help="Sarvam API subscription key (defaults to the SARVAM_API_KEY env var)")
    sarvam.add_argument("--sarvam-model", default="saaras:v3", help="Sarvam model id (default: saaras:v3)")
    sarvam.add_argument("--script-style", choices=list(SCRIPT_STYLES.keys()), default="mixed",
                         help="How to write out mixed Telugu/English speech: "
                              "'mixed' (default) = Telugu + English, each word in its own script; "
                              "'english_chat' = everything in English/Roman letters, Telugu spelled phonetically (chat-style); "
                              "'telugu' = everything normalized into Telugu script, including English words")
    sarvam.add_argument("--stt-mode", default=None, choices=["codemix", "transcribe", "translate", "verbatim", "translit"],
                         help="Advanced: override the Sarvam mode implied by --script-style")
    sarvam.add_argument("--language-code", default=None,
                         help="Advanced: override the language code implied by --script-style (BCP-47 like te-IN/en-IN, or 'unknown')")
    sarvam.add_argument("--min-chunk-seconds", type=float, default=1.0,
                         help="Don't cut a chunk shorter than this even if a pause is detected sooner (default: 1.0)")
    sarvam.add_argument("--max-chunk-seconds", type=float, default=25.0,
                         help="Hard cap on chunk length — used if no pause is found in time, to stay under "
                              "Sarvam's ~30s real-time request limit (default: 25)")
    sarvam.add_argument("--silence-db", type=int, default=-30,
                         help="Loudness (dB) below which audio counts as a pause. Less negative (e.g. -25) catches "
                              "pauses under background noise/music; more negative (e.g. -40) requires near-total silence (default: -30)")
    sarvam.add_argument("--silence-min-dur", type=float, default=0.3,
                         help="Minimum pause length (seconds) to count as a cut point — lower catches brief "
                              "breath pauses between sentences (default: 0.3)")

    whisper = parser.add_argument_group("Whisper engine options")
    whisper.add_argument("--whisper-model", default="small",
                          choices=["tiny", "base", "small", "medium", "large-v3"],
                          help="Whisper model size — bigger is more accurate but slower (default: small)")

    parser.add_argument("--cookies", help="Path to a cookies.txt file (needed for private/age-gated content you have access to)")
    parser.add_argument("--keep-media", action="store_true", help="Also save the downloaded video file, not just the transcript (URL sources only)")

    args = parser.parse_args()
    outdir = Path(args.outdir)

    if args.file:
        sources = [line.strip() for line in Path(args.file).read_text(encoding="utf-8").splitlines() if line.strip()]
    else:
        sources = [args.source]

    sarvam_opts = {}
    if args.engine == "sarvam":
        api_key = args.api_key or os.environ.get("SARVAM_API_KEY")
        if not api_key:
            parser.error("Sarvam engine needs an API key: pass --api-key or set the SARVAM_API_KEY environment variable.")
        style = SCRIPT_STYLES[args.script_style]
        sarvam_opts = {
            "api_key": api_key,
            "model": args.sarvam_model,
            "mode": args.stt_mode or style["mode"],
            "language_code": args.language_code or style["language_code"],
            "min_chunk_len": args.min_chunk_seconds,
            "max_chunk_len": args.max_chunk_seconds,
            "silence_db": args.silence_db,
            "silence_min_dur": args.silence_min_dur,
        }

    results = []
    failures = []
    for source in sources:
        try:
            results.append(process_source(source, outdir, args.engine, args.cookies, args.keep_media, sarvam_opts, args.whisper_model))
        except Exception as e:
            log(f"FAILED: {source} -> {e}")
            failures.append({"source": source, "error": str(e)})

    print("\n" + "=" * 60)
    for r in results:
        print(f"\nSource: {r['source']}")
        print(f"Language: {r['language']}")
        print("-" * 60)
        print(r["text"])
    if failures:
        print(f"\n{len(failures)} source(s) failed. See logs above.")


if __name__ == "__main__":
    main()
