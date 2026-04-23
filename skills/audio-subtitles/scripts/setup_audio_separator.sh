#!/usr/bin/env bash
set -euo pipefail

venv_dir="${AUDIO_SUBTITLES_VENV:-$HOME/.local/share/audio-subtitles-venv}"

python3 -m venv "$venv_dir"
"$venv_dir/bin/python" -m pip install --upgrade pip
"$venv_dir/bin/python" -m pip install --upgrade "audio-separator[cpu]"

echo "Installed audio-separator in: $venv_dir"
echo "Run: audio-subtitles --separate \"/path/to/audio-or-video\""
