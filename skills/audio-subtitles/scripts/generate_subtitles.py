#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Callable, Iterable
from urllib.parse import urlparse


AUDIO_EXTS = {
    ".wav",
    ".waw",
    ".mp3",
    ".m4a",
    ".flac",
    ".aac",
    ".ogg",
    ".opus",
    ".aiff",
    ".aif",
}
VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}
MEDIA_EXTS = AUDIO_EXTS | VIDEO_EXTS
SKILL_DIR = Path(__file__).resolve().parents[1]
DEFAULT_VENV = Path.home() / ".local/share/audio-subtitles-venv"


@dataclass
class Cue:
    start: float
    end: float
    text: str


def main() -> int:
    maybe_reexec_venv()
    args = parse_args()
    require_binary("ffmpeg")
    output_dir = Path(args.output_dir).expanduser() if args.output_dir else default_output_dir(args.input)
    output_dir.mkdir(parents=True, exist_ok=True)

    cleanups: list[Callable[[], None]] = []
    source, source_cleanup = resolve_source(args.input, args.stem, output_dir, args)
    cleanups.append(source_cleanup)
    if args.separate:
        source = separate_source(source, output_dir, args)
    base_name = safe_stem(source)
    audio_path, cleanup = prepare_audio(source, output_dir, base_name, args.save_audio)
    cleanups.append(cleanup)
    try:
        cues, metadata = transcribe(audio_path, args)
    finally:
        for cleanup_func in reversed(cleanups):
            cleanup_func()

    formats = parse_formats(args.formats)
    outputs = write_outputs(output_dir, base_name, cues, metadata, formats)

    print(f"Source: {source}")
    print(f"Output directory: {output_dir}")
    for path in outputs:
        print(path)
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate SRT, VTT, LRC, TXT, and JSON subtitles from audio, video, or UVR vocal stems."
    )
    parser.add_argument("input", help="Audio/video file, UVR output folder, or YouTube/media URL.")
    parser.add_argument("--output-dir", help="Directory for generated subtitle files.")
    parser.add_argument("--model", default="medium", help="Whisper model name, e.g. small, medium, large-v3-turbo.")
    parser.add_argument("--language", help="Language code such as en, zh, ja. Omit for auto-detect.")
    parser.add_argument("--task", choices=["transcribe", "translate"], default="transcribe")
    parser.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
    parser.add_argument("--compute-type", default="auto", help="auto, int8, float16, float32, int8_float16.")
    parser.add_argument("--formats", default="srt,vtt,lrc,txt,json", help="Comma list: srt,vtt,lrc,txt,json.")
    parser.add_argument("--stem", choices=["auto", "vocals", "instrumental", "none"], default="auto")
    parser.add_argument("--separate", action="store_true", help="Separate vocals/instrumental first with audio-separator.")
    parser.add_argument("--separator-model", help="audio-separator model filename. Omit to use its default.")
    parser.add_argument("--separator-preset", help="audio-separator ensemble preset, e.g. vocal_balanced.")
    parser.add_argument("--separator-output-dir", help="Directory for separated stems. Defaults to output-dir/stems.")
    parser.add_argument("--separator-format", default="WAV", help="Stem output format for audio-separator.")
    parser.add_argument("--browser", help="Use yt-dlp cookies from browser, e.g. chrome or safari.")
    parser.add_argument("--cookies", help="Use a Netscape-format cookies.txt file with yt-dlp.")
    parser.add_argument("--max-line-chars", type=int, default=42)
    parser.add_argument("--max-line-words", type=int, default=10)
    parser.add_argument("--line-gap", type=float, default=1.15, help="Start a new lyric line after this word gap in seconds.")
    parser.add_argument("--no-word-timestamps", action="store_true", help="Use segment timestamps only.")
    parser.add_argument("--save-audio", action="store_true", help="Save extracted 16 kHz mono WAV next to outputs.")
    parser.add_argument("--vad-filter", action="store_true", help="Enable VAD filtering in faster-whisper.")
    return parser.parse_args()


def maybe_reexec_venv() -> None:
    venv_python = Path(os.environ.get("AUDIO_SUBTITLES_PYTHON", DEFAULT_VENV / "bin/python")).expanduser()
    if not venv_python.exists():
        return
    if Path(sys.executable) != venv_python:
        os.execv(str(venv_python), [str(venv_python), str(Path(__file__).resolve()), *sys.argv[1:]])


def resolve_source(input_value: str, stem: str, output_dir: Path, args: argparse.Namespace) -> tuple[Path, Callable[[], None]]:
    if is_url(input_value):
        return download_url_audio(input_value, output_dir, args)

    path = Path(input_value).expanduser().resolve()
    if not path.exists():
        raise SystemExit(f"Input not found: {path}")
    if path.is_file():
        if path.suffix.lower() not in MEDIA_EXTS:
            raise SystemExit(f"Unsupported media file: {path}")
        return path, lambda: None
    candidates = [p for p in path.rglob("*") if p.is_file() and p.suffix.lower() in MEDIA_EXTS]
    if not candidates:
        raise SystemExit(f"No supported media files found in: {path}")
    return choose_stem(candidates, stem), lambda: None


def choose_stem(candidates: list[Path], stem: str) -> Path:
    scored = sorted(((stem_score(path, stem), str(path).lower(), path) for path in candidates), reverse=True)
    best_score, _, best_path = scored[0]
    if stem in {"vocals", "instrumental"} and best_score < 50:
        raise SystemExit(f"No likely {stem} stem found. Pass the exact file instead.")
    return best_path


def stem_score(path: Path, stem: str) -> int:
    name = path.stem.lower()
    score = 0
    vocal_markers = ["vocals", "vocal", "voice", "voices", "acapella", "a capella", "karaoke-vocal"]
    instrumental_markers = ["instrumental", "inst", "no_vocals", "no-vocals", "accompaniment", "karaoke"]

    if stem in {"auto", "vocals"}:
        if any(marker in name for marker in vocal_markers):
            score += 100
        if any(marker in name for marker in instrumental_markers):
            score -= 80
    elif stem == "instrumental":
        if any(marker in name for marker in instrumental_markers):
            score += 100
        if any(marker in name for marker in vocal_markers):
            score -= 80
    else:
        score += 10

    if path.suffix.lower() == ".wav":
        score += 8
    if path.suffix.lower() in VIDEO_EXTS:
        score -= 5
    return score


def default_output_dir(input_value: str) -> Path:
    if is_url(input_value):
        return Path.home() / "Downloads/Audio Subtitles"
    original = Path(input_value).expanduser().resolve()
    return original if original.is_dir() else original.parent


def require_binary(name: str) -> None:
    if shutil.which(name) is None:
        raise SystemExit(f"Missing dependency: {name}. Install ffmpeg first.")


def is_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def download_url_audio(url: str, output_dir: Path, args: argparse.Namespace) -> tuple[Path, Callable[[], None]]:
    require_binary("yt-dlp")
    if args.save_audio:
        download_dir = output_dir
        cleanup = lambda: None
    else:
        temp_dir = tempfile.TemporaryDirectory(prefix="audio-subtitles-url-")
        download_dir = Path(temp_dir.name)
        cleanup = temp_dir.cleanup

    cmd = [
        "yt-dlp",
        "-x",
        "--audio-format",
        "wav",
        "--audio-quality",
        "0",
        "--no-playlist",
        "-P",
        str(download_dir),
        "-o",
        "%(title).180B [%(id)s].%(ext)s",
        "--print",
        "after_move:filepath",
        url,
    ]
    if args.browser:
        cmd[1:1] = ["--cookies-from-browser", args.browser]
    if args.cookies:
        cmd[1:1] = ["--cookies", args.cookies]
    result = subprocess.run(cmd, check=True, text=True, stdout=subprocess.PIPE)
    paths = [Path(line.strip()) for line in result.stdout.splitlines() if line.strip()]
    for path in reversed(paths):
        if path.exists():
            return path, cleanup
    media_files = sorted(download_dir.glob("*"))
    for path in media_files:
        if path.is_file() and path.suffix.lower() in MEDIA_EXTS:
            return path, cleanup
    cleanup()
    raise SystemExit("yt-dlp finished but no downloaded audio file was found.")


def separate_source(source: Path, output_dir: Path, args: argparse.Namespace) -> Path:
    separator = find_audio_separator()
    stems_dir = Path(args.separator_output_dir).expanduser() if args.separator_output_dir else output_dir / "stems"
    stems_dir.mkdir(parents=True, exist_ok=True)
    before = {path.resolve() for path in stems_dir.rglob("*") if path.is_file()}
    cmd = [
        str(separator),
        str(source),
        "--output_dir",
        str(stems_dir),
        "--output_format",
        args.separator_format,
    ]
    if args.separator_model:
        cmd.extend(["--model_filename", args.separator_model])
    if args.separator_preset:
        cmd.extend(["--ensemble_preset", args.separator_preset])
    subprocess.run(cmd, check=True)
    after = [path for path in stems_dir.rglob("*") if path.is_file() and path.resolve() not in before]
    candidates = [path for path in after if path.suffix.lower() in MEDIA_EXTS]
    if not candidates:
        candidates = [path for path in stems_dir.rglob("*") if path.is_file() and path.suffix.lower() in MEDIA_EXTS]
    if not candidates:
        raise SystemExit(f"audio-separator produced no supported stem files in: {stems_dir}")
    vocal = choose_stem(candidates, "vocals")
    print(f"Separated stems directory: {stems_dir}", file=sys.stderr)
    print(f"Transcribing vocal stem: {vocal}", file=sys.stderr)
    return vocal


def find_audio_separator() -> Path:
    candidates = [
        Path(sys.executable).parent / "audio-separator",
        Path.home() / ".local/share/audio-subtitles-venv/bin/audio-separator",
    ]
    found = shutil.which("audio-separator")
    if found:
        candidates.append(Path(found))
    for candidate in candidates:
        if candidate.exists() and os.access(candidate, os.X_OK):
            return candidate
    setup_script = SKILL_DIR / "scripts/setup_audio_separator.sh"
    raise SystemExit(
        "Missing dependency: audio-separator\n"
        f"Install it with: {setup_script}\n"
        "Then rerun with --separate."
    )


def prepare_audio(source: Path, output_dir: Path, base_name: str, save_audio: bool) -> tuple[Path, Callable[[], None]]:
    if save_audio:
        audio_path = output_dir / f"{base_name}.transcribe.wav"
        convert_audio(source, audio_path)
        return audio_path, lambda: None

    temp_dir = tempfile.TemporaryDirectory(prefix="audio-subtitles-")
    audio_path = Path(temp_dir.name) / "audio.wav"
    convert_audio(source, audio_path)
    return audio_path, temp_dir.cleanup


def convert_audio(source: Path, target: Path) -> None:
    cmd = [
        "ffmpeg",
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-i",
        str(source),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "16000",
        "-c:a",
        "pcm_s16le",
        str(target),
    ]
    subprocess.run(cmd, check=True)


def transcribe(audio_path: Path, args: argparse.Namespace) -> tuple[list[Cue], dict]:
    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        setup_script = SKILL_DIR / "scripts/setup_faster_whisper.sh"
        raise SystemExit(
            "Missing Python package: faster-whisper\n"
            f"Install it with: {setup_script}\n"
            "Then rerun the same audio-subtitles command."
        ) from exc

    device = "cpu" if args.device == "auto" else args.device
    compute_type = "int8" if args.compute_type == "auto" and device == "cpu" else args.compute_type
    if compute_type == "auto":
        compute_type = "float16" if device == "cuda" else "int8"

    model = WhisperModel(args.model, device=device, compute_type=compute_type)
    segments, info = model.transcribe(
        str(audio_path),
        language=args.language,
        task=args.task,
        beam_size=5,
        vad_filter=args.vad_filter,
        word_timestamps=not args.no_word_timestamps,
        condition_on_previous_text=False,
    )
    segment_list = list(segments)
    cues = cues_from_segments(segment_list, args)
    metadata = {
        "model": args.model,
        "device": device,
        "compute_type": compute_type,
        "language": getattr(info, "language", None),
        "language_probability": getattr(info, "language_probability", None),
        "duration": getattr(info, "duration", None),
    }
    return cues, metadata


def cues_from_segments(segments: Iterable[object], args: argparse.Namespace) -> list[Cue]:
    cues: list[Cue] = []
    for segment in segments:
        words = getattr(segment, "words", None)
        if words:
            cues.extend(cues_from_words(words, args.max_line_chars, args.max_line_words, args.line_gap))
        else:
            text = clean_text(getattr(segment, "text", ""))
            if text:
                cues.append(Cue(float(segment.start), float(segment.end), text))
    return [cue for cue in cues if cue.text]


def cues_from_words(words: Iterable[object], max_chars: int, max_words: int, line_gap: float) -> list[Cue]:
    cues: list[Cue] = []
    current_words: list[str] = []
    start: float | None = None
    end: float | None = None
    previous_end: float | None = None

    def flush() -> None:
        nonlocal current_words, start, end
        text = clean_text(" ".join(current_words))
        if text and start is not None and end is not None:
            cues.append(Cue(start, max(end, start + 0.25), text))
        current_words = []
        start = None
        end = None

    for item in words:
        word = clean_text(getattr(item, "word", ""))
        if not word:
            continue
        word_start = float(getattr(item, "start", previous_end or 0.0) or 0.0)
        word_end = float(getattr(item, "end", word_start + 0.3) or word_start + 0.3)
        gap = 0.0 if previous_end is None else word_start - previous_end
        next_len = len(" ".join([*current_words, word]))
        if current_words and (gap > line_gap or len(current_words) >= max_words or next_len > max_chars):
            flush()
        if start is None:
            start = word_start
        current_words.append(word)
        end = word_end
        previous_end = word_end
    flush()
    return cues


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def parse_formats(value: str) -> set[str]:
    formats = {item.strip().lower() for item in value.split(",") if item.strip()}
    allowed = {"srt", "vtt", "lrc", "txt", "json"}
    unknown = formats - allowed
    if unknown:
        raise SystemExit(f"Unsupported formats: {', '.join(sorted(unknown))}")
    return formats


def write_outputs(output_dir: Path, base_name: str, cues: list[Cue], metadata: dict, formats: set[str]) -> list[Path]:
    outputs: list[Path] = []
    if "srt" in formats:
        path = output_dir / f"{base_name}.srt"
        path.write_text(render_srt(cues), encoding="utf-8")
        outputs.append(path)
    if "vtt" in formats:
        path = output_dir / f"{base_name}.vtt"
        path.write_text(render_vtt(cues), encoding="utf-8")
        outputs.append(path)
    if "lrc" in formats:
        path = output_dir / f"{base_name}.lrc"
        path.write_text(render_lrc(cues), encoding="utf-8")
        outputs.append(path)
    if "txt" in formats:
        path = output_dir / f"{base_name}.txt"
        path.write_text(render_txt(cues, metadata), encoding="utf-8")
        outputs.append(path)
    if "json" in formats:
        path = output_dir / f"{base_name}.json"
        payload = {"metadata": metadata, "cues": [asdict(cue) for cue in cues]}
        path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        outputs.append(path)
    return outputs


def render_srt(cues: list[Cue]) -> str:
    blocks = []
    for index, cue in enumerate(cues, 1):
        blocks.append(f"{index}\n{srt_time(cue.start)} --> {srt_time(cue.end)}\n{cue.text}")
    return "\n\n".join(blocks) + "\n"


def render_vtt(cues: list[Cue]) -> str:
    blocks = ["WEBVTT\n"]
    for cue in cues:
        blocks.append(f"{vtt_time(cue.start)} --> {vtt_time(cue.end)}\n{cue.text}")
    return "\n\n".join(blocks) + "\n"


def render_lrc(cues: list[Cue]) -> str:
    return "".join(f"[{lrc_time(cue.start)}] {cue.text}\n" for cue in cues)


def render_txt(cues: list[Cue], metadata: dict) -> str:
    lines = [
        f"model: {metadata.get('model')}",
        f"language: {metadata.get('language')} ({metadata.get('language_probability')})",
        "",
    ]
    lines.extend(f"[{vtt_time(cue.start)} --> {vtt_time(cue.end)}] {cue.text}" for cue in cues)
    return "\n".join(lines) + "\n"


def srt_time(seconds: float) -> str:
    return timestamp(seconds, comma=True, hours=True)


def vtt_time(seconds: float) -> str:
    return timestamp(seconds, comma=False, hours=True)


def lrc_time(seconds: float) -> str:
    seconds = max(0.0, seconds)
    minutes = int(seconds // 60)
    secs = seconds - minutes * 60
    return f"{minutes:02d}:{secs:05.2f}"


def timestamp(seconds: float, comma: bool, hours: bool) -> str:
    seconds = max(0.0, seconds)
    millis = int(round((seconds - int(seconds)) * 1000))
    whole = int(seconds)
    if millis == 1000:
        whole += 1
        millis = 0
    hrs = whole // 3600
    mins = (whole % 3600) // 60
    secs = whole % 60
    sep = "," if comma else "."
    if hours:
        return f"{hrs:02d}:{mins:02d}:{secs:02d}{sep}{millis:03d}"
    return f"{mins:02d}:{secs:02d}{sep}{millis:03d}"


def safe_stem(path: Path) -> str:
    stem = re.sub(r"[\\/:*?\"<>|]+", "_", path.stem).strip()
    return stem or "subtitles"


if __name__ == "__main__":
    raise SystemExit(main())
