---
name: youtube-mp3
description: Download media URLs such as YouTube or Bilibili as MP3 audio using yt-dlp and ffmpeg. Use when the user asks to download a media URL as MP3/audio, extract audio from YouTube/Bilibili, save music locally, troubleshoot yt-dlp/ffmpeg for audio downloads, or run a repeatable media-to-MP3 workflow.
---

# Media MP3

## Default Workflow

Use the bundled script for downloads:

```bash
media-mp3 "https://www.youtube.com/watch?v=..."
media-mp3 "https://www.bilibili.com/video/BV..."
```

Default behavior:

- Save MP3 files to `$HOME/Downloads/VocalFlow MP3`.
- Use `yt-dlp -t mp3`, which selects best audio and converts it to MP3.
- Use `ffmpeg`/`ffprobe` for audio post-processing.
- Download a single video by default with `--no-playlist`.
- Embed available metadata, preserve readable titles, and include the media id in filenames.
- Do not modify global `yt-dlp` config unless the user explicitly asks.
- Do not use browser automation for this workflow; use CLI commands only.
- Keep `youtube-mp3` available as a backward-compatible alias.

## Common Commands

Choose another output folder:

```bash
media-mp3 -o "/path/to/output" "https://www.youtube.com/watch?v=..."
```

Download a playlist when the user explicitly asks for the whole playlist:

```bash
media-mp3 --playlist "https://www.youtube.com/playlist?list=..."
```

Use browser cookies only when the user is authorized to access the content and asks for it:

```bash
media-mp3 --browser chrome "https://www.youtube.com/watch?v=..."
media-mp3 --browser chrome "https://www.bilibili.com/video/BV..."
```

Use a manually exported Netscape-format cookies file only when browser extraction does not work:

```bash
media-mp3 --cookies "/path/to/cookies.txt" "https://www.youtube.com/watch?v=..."
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

- If a site asks for sign-in, have the user open it in Chrome or Safari, sign in, solve any CAPTCHA/check, then retry with `--browser chrome` or `--browser safari`.
- If extraction fails, first update `yt-dlp`; supported sites often change their extractors.
- If conversion fails, check that `ffmpeg` and `ffprobe` are both on `PATH`.
- If a URL includes `list=...` but the user only asked for one video, keep the default single-video behavior.
- If content requires sign-in, age verification, or membership access, ask before using browser cookies; never help bypass access controls.
- Treat cookies as secrets; do not paste, print, commit, or share cookies files.
- After a successful download, report the saved file path printed by the script.
