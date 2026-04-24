#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
skills_dir="${CODEX_HOME:-$HOME/.codex}/skills"
bin_dir="$HOME/.local/bin"

mkdir -p "$skills_dir" "$bin_dir"
rm -rf "$skills_dir/audio-subtitles" "$skills_dir/youtube-mp3"
cp -R "$repo_dir/skills/audio-subtitles" "$skills_dir/"
cp -R "$repo_dir/skills/youtube-mp3" "$skills_dir/"

cat > "$bin_dir/audio-subtitles" <<EOF
#!/usr/bin/env bash
set -euo pipefail
script="$skills_dir/audio-subtitles/scripts/generate_subtitles.py"
venv_python="\${AUDIO_SUBTITLES_PYTHON:-\$HOME/.local/share/audio-subtitles-venv/bin/python}"
if [[ -x "\$venv_python" ]]; then
  exec "\$venv_python" "\$script" "\$@"
fi
exec python3 "\$script" "\$@"
EOF

cat > "$bin_dir/youtube-mp3" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec "$skills_dir/youtube-mp3/scripts/download_mp3.sh" "\$@"
EOF

cat > "$bin_dir/media-mp3" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec "$skills_dir/youtube-mp3/scripts/download_mp3.sh" "\$@"
EOF

cat > "$bin_dir/setup-audio-subtitles" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec "$skills_dir/audio-subtitles/scripts/setup_faster_whisper.sh" "\$@"
EOF

cat > "$bin_dir/setup-audio-separator" <<EOF
#!/usr/bin/env bash
set -euo pipefail
exec "$skills_dir/audio-subtitles/scripts/setup_audio_separator.sh" "\$@"
EOF

chmod +x \
  "$bin_dir/audio-subtitles" \
  "$bin_dir/media-mp3" \
  "$bin_dir/youtube-mp3" \
  "$bin_dir/setup-audio-subtitles" \
  "$bin_dir/setup-audio-separator" \
  "$skills_dir/audio-subtitles/scripts/generate_subtitles.py" \
  "$skills_dir/audio-subtitles/scripts/setup_faster_whisper.sh" \
  "$skills_dir/audio-subtitles/scripts/setup_audio_separator.sh" \
  "$skills_dir/youtube-mp3/scripts/download_mp3.sh"

echo "Installed skills to: $skills_dir"
echo "Installed commands to: $bin_dir"
echo "Ensure this is on PATH: $bin_dir"
