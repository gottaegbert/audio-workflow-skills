#!/usr/bin/env bash
set -euo pipefail

venv_dir="${AUDIO_SUBTITLES_VENV:-$HOME/.local/share/audio-subtitles-venv}"

python3 -m venv "$venv_dir"
"$venv_dir/bin/python" -m pip install --upgrade pip
"$venv_dir/bin/python" -m pip install --upgrade faster-whisper

echo "Installed faster-whisper in: $venv_dir"
echo "Run: audio-subtitles \"/path/to/audio-or-video\""
