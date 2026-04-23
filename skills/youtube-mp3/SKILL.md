---
name: youtube-mp3
description: Download YouTube videos, Shorts, music, and playlists as MP3 audio using yt-dlp and ffmpeg. Use when the user asks to download a YouTube URL as MP3/audio, extract audio from YouTube, save YouTube music locally, troubleshoot yt-dlp/ffmpeg for audio downloads, or run a repeatable YouTube-to-MP3 workflow.
---

# YouTube MP3

## Default Workflow

Use the bundled script for downloads:

```bash
youtube-mp3 "https://www.youtube.com/watch?v=..."
```

Default behavior:

- Save MP3 files to `$HOME/Downloads/YouTube MP3`.
- Use `yt-dlp -t mp3`, which selects best audio and converts it to MP3.
- Use `ffmpeg`/`ffprobe` for audio post-processing.
- Download a single video by default with `--no-playlist`.
- Embed available metadata, preserve readable titles, and include the YouTube id in filenames.
- Do not modify global `yt-dlp` config unless the user explicitly asks.
- Do not use browser automation for this workflow; use CLI commands only.

## Common Commands

Choose another output folder:

```bash
youtube-mp3 -o "/path/to/output" "https://www.youtube.com/watch?v=..."
```

Download a playlist when the user explicitly asks for the whole playlist:

```bash
youtube-mp3 --playlist "https://www.youtube.com/playlist?list=..."
```

Use browser cookies only when the user is authorized to access the content and asks for it:

```bash
youtube-mp3 --browser chrome "https://www.youtube.com/watch?v=..."
```

Use a manually exported Netscape-format cookies file only when browser extraction does not work:

```bash
youtube-mp3 --cookies "/path/to/cookies.txt" "https://www.youtube.com/watch?v=..."
```

## Checks

Before downloading, verify dependencies when needed:

```bash
yt-dlp --version
ffmpeg -version
ffprobe -version
```

On macOS with Homebrew, install missing dependencies:

```bash
HOMEBREW_NO_AUTO_UPDATE=1 brew install yt-dlp ffmpeg
```

For Homebrew installs, update `yt-dlp` with:

```bash
HOMEBREW_NO_AUTO_UPDATE=1 brew upgrade yt-dlp
```

## Troubleshooting

- If YouTube says `Sign in to confirm you're not a bot`, have the user open YouTube in Chrome or Safari, sign in, solve any CAPTCHA/check, then retry with `--browser chrome` or `--browser safari`.
- If YouTube extraction fails, first update `yt-dlp`; YouTube changes often break older extractors.
- If conversion fails, check that `ffmpeg` and `ffprobe` are both on `PATH`.
- If a URL includes `list=...` but the user only asked for one video, keep the default single-video behavior.
- If content requires sign-in, age verification, or membership access, ask before using browser cookies; never help bypass access controls.
- Treat cookies as secrets; do not paste, print, commit, or share cookies files.
- After a successful download, report the saved file path printed by the script.
