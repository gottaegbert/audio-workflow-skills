#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  media-mp3 [options] URL [URL...]

Options:
  -o, --output-dir DIR          Save MP3 files to DIR.
      --playlist                Download the full playlist instead of a single item.
      --browser B               Shortcut for --cookies-from-browser B.
      --cookies-from-browser B  Use yt-dlp cookies from a browser profile, e.g. chrome.
      --cookies FILE            Use a Netscape-format cookies.txt file.
  -h, --help                    Show this help.

Environment:
  MEDIA_MP3_DIR                 Default output directory.
  YOUTUBE_MP3_DIR               Backward-compatible default output directory.
USAGE
}

output_dir="${MEDIA_MP3_DIR:-${YOUTUBE_MP3_DIR:-$HOME/Downloads/VocalFlow MP3}}"
playlist=false
cookies_browser=""
cookies_file=""
urls=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    -o|--output-dir)
      [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 2; }
      output_dir="$2"
      shift 2
      ;;
    --playlist)
      playlist=true
      shift
      ;;
    --browser|--cookies-from-browser)
      [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 2; }
      cookies_browser="$2"
      shift 2
      ;;
    --cookies)
      [[ $# -ge 2 ]] || { echo "Missing value for $1" >&2; exit 2; }
      cookies_file="$2"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      while [[ $# -gt 0 ]]; do
        urls+=("$1")
        shift
      done
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
    *)
      urls+=("$1")
      shift
      ;;
  esac
done

if [[ ${#urls[@]} -eq 0 ]]; then
  usage >&2
  exit 2
fi

for bin in yt-dlp ffmpeg ffprobe; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "Missing dependency: $bin" >&2
    exit 1
  fi
done

mkdir -p "$output_dir"

cmd=(
  yt-dlp
  -t mp3
  --audio-quality 0
  --embed-metadata
  --no-mtime
  --windows-filenames
  --trim-filenames 180
  -P "$output_dir"
  -o "%(title).180B [%(id)s].%(ext)s"
  --print "after_move:filepath"
)

if [[ "$playlist" == true ]]; then
  cmd+=(--yes-playlist)
else
  cmd+=(--no-playlist)
fi

if [[ -n "$cookies_browser" ]]; then
  cmd+=(--cookies-from-browser "$cookies_browser")
fi

if [[ -n "$cookies_file" ]]; then
  cmd+=(--cookies "$cookies_file")
fi

cmd+=("${urls[@]}")

echo "Saving MP3 to: $output_dir" >&2
"${cmd[@]}"
