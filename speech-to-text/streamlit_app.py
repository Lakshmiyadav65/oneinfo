#!/usr/bin/env python3
"""
Streamlit UI for the video transcriber.

Upload a video (or paste a Reel URL), pick an engine, hit Transcribe, and get
back a script — with Telugu sentences in Telugu script and English sentences
in English when using the Sarvam engine.

Run with:
    .\\.venv\\Scripts\\python.exe -m streamlit run streamlit_app.py
"""

import json
import os
import tempfile
from pathlib import Path

import streamlit as st

from transcribe_reel import SCRIPT_STYLES, process_source

st.set_page_config(page_title="Video Transcriber", page_icon="🎬", layout="centered")

st.title("🎬 Video → Script Transcriber")
st.caption(
    "Upload a video or paste a Reel URL to get a text transcript. "
    "With the Sarvam engine, Telugu sentences come back in Telugu script and English sentences stay in English."
)

with st.sidebar:
    st.header("Settings")
    engine = st.radio(
        "Engine",
        ["sarvam", "whisper"],
        index=0,
        help="Sarvam AI API (handles Telugu/English switching, needs an API key) "
             "or local faster-whisper (no API key, no network, no code-switch handling).",
    )

    api_key = None
    sarvam_model = "saaras:v3"
    script_style = "mixed"
    min_chunk_seconds = 1.0
    max_chunk_seconds = 25.0
    silence_db = -30
    silence_min_dur = 0.3
    whisper_model = "small"

    if engine == "sarvam":
        api_key = st.text_input(
            "Sarvam API key",
            value=os.environ.get("SARVAM_API_KEY", ""),
            type="password",
            help="Pre-filled from the SARVAM_API_KEY environment variable if it's set.",
        )

        style_keys = list(SCRIPT_STYLES.keys())
        script_style = st.radio(
            "Script style",
            style_keys,
            index=0,
            format_func=lambda k: SCRIPT_STYLES[k]["label"],
            help="How mixed Telugu/English speech gets written out in the transcript.",
        )

        with st.expander("Advanced Sarvam options"):
            sarvam_model = st.text_input("Model", value=sarvam_model)
            preset = SCRIPT_STYLES[script_style]
            override_mode = st.selectbox(
                "Override mode", ["(use script style)", "codemix", "transcribe", "translate", "verbatim", "translit"], index=0,
                help=f"Script style '{preset['label']}' uses mode='{preset['mode']}'. Only change this if you know what you're doing.",
            )
            override_lang = st.text_input(
                "Override language code", value="",
                help=f"Script style '{preset['label']}' uses language_code='{preset['language_code']}'. Leave blank to use that.",
            )
            stt_mode = preset["mode"] if override_mode == "(use script style)" else override_mode
            language_code = override_lang.strip() or preset["language_code"]
            st.caption(
                "Chunking splits audio at pauses so each chunk is one utterance — if a chunk still mixes "
                "languages, try lowering min chunk length and/or loosening silence sensitivity below."
            )
            min_chunk_seconds = st.slider("Min chunk length (seconds)", 0.3, 10.0, min_chunk_seconds)
            max_chunk_seconds = st.slider("Max chunk length (seconds, hard cap)", 10.0, 28.0, max_chunk_seconds)
            silence_db = st.slider(
                "Silence threshold (dB)", -50, -15, silence_db,
                help="Less negative catches pauses under background noise/music; more negative requires near-total silence.",
            )
            silence_min_dur = st.slider(
                "Min pause duration (seconds)", 0.1, 1.0, silence_min_dur,
                help="Lower catches brief breath pauses between sentences.",
            )
    else:
        whisper_model = st.selectbox("Whisper model size", ["tiny", "base", "small", "medium", "large-v3"], index=2)

    outdir = st.text_input("Save transcripts to folder", value="transcripts")

tab_upload, tab_url = st.tabs(["Upload video file", "Reel URL"])

uploaded = None
url_input = ""
cookies_file = None

with tab_upload:
    uploaded = st.file_uploader("Video file", type=["mp4", "mov", "mkv", "webm", "m4v", "avi"])

with tab_url:
    url_input = st.text_input("Instagram Reel URL")
    cookies_file = st.file_uploader("cookies.txt (optional, for private content)", type=["txt"])

run = st.button("Transcribe", type="primary")

if run:
    if engine == "sarvam" and not api_key:
        st.error("Please enter your Sarvam API key in the sidebar.")
        st.stop()
    if uploaded is None and not url_input.strip():
        st.error("Upload a video file or enter a Reel URL first.")
        st.stop()

    status_box = st.status("Starting…", expanded=True)

    def report(msg: str):
        status_box.write(msg)

    sarvam_opts = {}
    if engine == "sarvam":
        sarvam_opts = {
            "api_key": api_key,
            "model": sarvam_model,
            "mode": stt_mode,
            "language_code": language_code,
            "min_chunk_len": min_chunk_seconds,
            "max_chunk_len": max_chunk_seconds,
            "silence_db": silence_db,
            "silence_min_dur": silence_min_dur,
        }

    result = None
    try:
        with tempfile.TemporaryDirectory() as tmp:
            cookies_path = None
            if uploaded is not None:
                tmp_video = Path(tmp) / Path(uploaded.name).name
                tmp_video.write_bytes(uploaded.getvalue())
                source = str(tmp_video)
            else:
                source = url_input.strip()
                if cookies_file is not None:
                    cookies_tmp = Path(tmp) / "cookies.txt"
                    cookies_tmp.write_bytes(cookies_file.getvalue())
                    cookies_path = str(cookies_tmp)

            result = process_source(
                source=source,
                outdir=Path(outdir),
                engine=engine,
                cookies=cookies_path,
                keep_media=False,
                sarvam_opts=sarvam_opts,
                whisper_model=whisper_model,
                on_progress=report,
            )
        status_box.update(label="Done", state="complete", expanded=False)
    except Exception as e:
        status_box.update(label="Failed", state="error")
        st.error(f"Transcription failed: {e}")
        st.stop()

    st.subheader("Transcript")
    st.caption(f"Detected language: {result['language']}")
    st.text_area("Script", value=result["text"], height=300)

    col1, col2 = st.columns(2)
    with col1:
        st.download_button("Download .txt", data=result["text"], file_name=f"{result['source_id']}.txt")
    with col2:
        st.download_button(
            "Download .json",
            data=json.dumps(result, indent=2, ensure_ascii=False),
            file_name=f"{result['source_id']}.json",
        )

    if result.get("segments"):
        with st.expander("Per-chunk segments (timestamps + detected language)"):
            st.json(result["segments"])
