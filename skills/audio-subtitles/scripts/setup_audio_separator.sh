#!/usr/bin/env bash
set -euo pipefail

venv_dir="${AUDIO_SUBTITLES_VENV:-$HOME/.local/share/audio-subtitles-venv}"

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  cat <<'USAGE'
Usage: setup-audio-separator

Install audio-separator[cpu] into the audio-subtitles virtual environment.
This enables audio-subtitles --separate for UVR-style vocals/instrumental separation.

Environment:
  AUDIO_SUBTITLES_VENV  Override the virtual environment directory.
USAGE
  exit 0
fi

python3 -m venv "$venv_dir"
"$venv_dir/bin/python" -m pip install --upgrade pip
"$venv_dir/bin/python" -m pip install --upgrade "audio-separator[cpu]"

echo "Installed audio-separator in: $venv_dir"
echo "Run: audio-subtitles --separate \"/path/to/audio-or-video\""
