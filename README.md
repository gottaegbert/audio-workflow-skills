# Audio Workflow Skills

Codex skills, CLI helpers, and a desktop app prototype for turning media links, audio files, video files, and vocal stems into karaoke and subtitle assets.

## 中文说明

### 适合什么场景

#### 1. 卡拉 OK / 练歌素材包

适合：复制 YouTube 或其他 yt-dlp 支持的网站链接，生成可练歌的素材。

你可以得到：

- 人声分离音频：`stems/` 里的 vocals stem。
- 伴奏音频：`stems/` 里的 instrumental / no-vocals stem。
- 同步歌词和字幕：`.lrc`, `.srt`, `.vtt`, `.txt`, `.json`。

CLI 示例：

```bash
audio-subtitles --separate --separator-format MP3 "https://www.youtube.com/watch?v=..."
```

说明：

- `--separate` 会先做 vocals / instrumental 分离，再转写人声。
- `--separator-format MP3` 会让分离出来的人声和伴奏尽量保存为 MP3；默认是 WAV。
- 如果网站已有字幕但你仍然需要人声分离音频，保留 `--separate`，因为只下载平台字幕不会生成 stems。

#### 2. 视频字幕提取 / 视频剪辑

适合：从本地视频或网站视频生成字幕文件，放进剪映、Premiere、DaVinci Resolve、Final Cut 或网页播放器。

本地视频：

```bash
audio-subtitles "/path/to/video.mp4"
```

网站链接：

```bash
audio-subtitles "https://www.youtube.com/watch?v=..."
```

你可以得到：

- `.srt`：视频剪辑软件最常用。
- `.vtt`：网页播放器常用。
- `.txt`：快速检查文字内容。
- `.json`：后续程序处理。
- `.lrc`：同步歌词或逐句播放场景。

默认策略：

- 对 YouTube 链接，工具会优先使用平台已有字幕或自动字幕，速度最快。
- 如果没有平台字幕，可以加 `--local-fallback`，让工具下载音频并用本地 Whisper 转写。

```bash
audio-subtitles --local-fallback "https://www.youtube.com/watch?v=..."
```

#### 3. 已经有人声 stem / UVR 输出

适合：你已经用 Ultimate Vocal Remover GUI 或其他工具分离好了人声。

```bash
audio-subtitles "/path/to/uvr-output-folder"
audio-subtitles "/path/to/vocals.wav"
```

工具会优先选择名称里包含 `vocals`, `vocal`, `voice`, `acapella` 的文件来生成歌词和字幕。

### 安装

```bash
git clone https://github.com/gottaegbert/audio-workflow-skills.git
cd audio-workflow-skills
./install.sh
```

安装运行依赖：

```bash
# macOS
HOMEBREW_NO_AUTO_UPDATE=1 brew install ffmpeg yt-dlp

# 本地字幕/歌词转写
setup-audio-subtitles

# 可选：人声/伴奏分离
setup-audio-separator
```

`setup-audio-separator` 会安装 PyTorch 和 source separation 相关依赖，体积比转写依赖大。只在需要 `audio-subtitles --separate` 时安装。

### 桌面 App 原型

桌面 app 是对 CLI 的图形界面封装，处理逻辑仍然来自 `audio-subtitles`。

```bash
./install.sh
cd apps/desktop
pnpm install
pnpm dev
```

桌面 app 当前支持：

- 粘贴 URL 或选择本地文件/文件夹。
- 选择输出目录。
- YouTube 字幕优先、本地 Whisper、可选本地 fallback。
- 可选人声/伴奏分离。
- 选择模型、语言、字幕语言、浏览器 cookies、输出格式。
- 预览命令、查看日志、打开输出文件。

### 发布 DMG / EXE

维护者推送版本 tag 后，GitHub Actions 会自动构建桌面安装包并上传到 GitHub Release：

```bash
git tag v0.1.0
git push origin v0.1.0
```

Release 产物：

- macOS: `.dmg`
- Windows: `.exe`

注意：当前桌面 app 是 CLI 外壳。用户安装 DMG/EXE 后，完整媒体处理仍需要本机安装 `audio-subtitles`、`ffmpeg`、`yt-dlp`，以及可选的本地转写/人声分离依赖。

### 常用命令

下载 YouTube MP3：

```bash
youtube-mp3 "https://www.youtube.com/watch?v=..."
youtube-mp3 --browser chrome "https://www.youtube.com/watch?v=..."
```

生成歌词和字幕：

```bash
audio-subtitles "/path/to/song.mp3"
audio-subtitles "/path/to/video.mp4"
audio-subtitles "https://www.youtube.com/watch?v=..."
```

指定字幕语言：

```bash
audio-subtitles --sub-langs "zh.*,en.*" "https://www.youtube.com/watch?v=..."
audio-subtitles --language zh "/path/to/video.mp4"
```

强制本地 Whisper：

```bash
audio-subtitles --subtitle-source local "https://www.youtube.com/watch?v=..."
audio-subtitles --force-local "https://www.youtube.com/watch?v=..."
```

保存到指定目录：

```bash
audio-subtitles --output-dir "/path/to/output" "/path/to/video.mp4"
```

### 输出文件

- `.lrc`：同步歌词。
- `.srt`：视频剪辑和字幕工具。
- `.vtt`：网页播放。
- `.txt`：带时间戳的文本检查。
- `.json`：机器可读的分段时间数据。
- `stems/`：启用 `--separate` 后的人声和伴奏文件。

### 注意事项

- 歌曲转写比普通讲话更难，副歌、和声、混响、重叠人声都可能需要人工修正。
- 干净的人声 stem 通常比单纯换更大的模型更能提升歌词准确度。
- 只处理你有权下载或处理的媒体。
- 浏览器 cookies 等同于登录凭据，不要提交到仓库或分享给别人。

## English

### Use Cases

#### 1. Karaoke / Singing Practice Package

Use this when you want to paste a YouTube or other yt-dlp-supported media link and generate practice-ready assets.

You can get:

- Separated vocal audio: the vocals stem under `stems/`.
- Backing track audio: the instrumental / no-vocals stem under `stems/`.
- Timed lyrics and subtitles: `.lrc`, `.srt`, `.vtt`, `.txt`, `.json`.

CLI example:

```bash
audio-subtitles --separate --separator-format MP3 "https://www.youtube.com/watch?v=..."
```

Notes:

- `--separate` runs vocals / instrumental separation before transcription.
- `--separator-format MP3` asks the separator to write stems as MP3; the default is WAV.
- If you need separated audio, keep `--separate`; downloading platform captions alone does not create stems.

#### 2. Video Subtitle Extraction

Use this when you need subtitle files for video editors, subtitle tools, or web playback.

Local video:

```bash
audio-subtitles "/path/to/video.mp4"
```

Media URL:

```bash
audio-subtitles "https://www.youtube.com/watch?v=..."
```

You can get:

- `.srt`: common video editor format.
- `.vtt`: web playback.
- `.txt`: quick review.
- `.json`: downstream processing.
- `.lrc`: synced lyrics or line-by-line playback.

Default behavior:

- For YouTube URLs, the tool uses existing platform subtitles or auto-subtitles first.
- If no platform captions exist, add `--local-fallback` to download audio and transcribe locally with Whisper.

```bash
audio-subtitles --local-fallback "https://www.youtube.com/watch?v=..."
```

#### 3. Existing Vocal Stems / UVR Output

Use this when you already separated vocals with Ultimate Vocal Remover GUI or another tool.

```bash
audio-subtitles "/path/to/uvr-output-folder"
audio-subtitles "/path/to/vocals.wav"
```

The tool prefers files named with markers such as `vocals`, `vocal`, `voice`, or `acapella`.

### Install

```bash
git clone https://github.com/gottaegbert/audio-workflow-skills.git
cd audio-workflow-skills
./install.sh
```

Install runtime dependencies:

```bash
# macOS
HOMEBREW_NO_AUTO_UPDATE=1 brew install ffmpeg yt-dlp

# local transcription
setup-audio-subtitles

# optional source separation
setup-audio-separator
```

`setup-audio-separator` installs PyTorch and separation dependencies, so it is much larger than the transcription-only setup. Install it only when you need `audio-subtitles --separate`.

### Desktop App Prototype

The desktop app is a graphical shell around the CLI. Media processing still comes from `audio-subtitles`.

```bash
./install.sh
cd apps/desktop
pnpm install
pnpm dev
```

Current desktop app scope:

- Paste a URL or choose a local file/folder.
- Select an output directory.
- YouTube subtitle-first mode, local Whisper mode, optional local fallback.
- Optional vocals / instrumental separation.
- Configure model, language, subtitle language selector, browser cookies, and output formats.
- Preview the command, inspect logs, and open generated files.

### Release DMG / EXE

Maintainers can push a version tag to let GitHub Actions build desktop installers and upload them to a GitHub Release:

```bash
git tag v0.1.0
git push origin v0.1.0
```

Release assets:

- macOS: `.dmg`
- Windows: `.exe`

Note: the desktop app is currently a CLI shell. After installing the DMG/EXE, full media processing still requires `audio-subtitles`, `ffmpeg`, `yt-dlp`, and the optional local transcription/separation dependencies on the user's machine.

### Common Commands

Download YouTube MP3:

```bash
youtube-mp3 "https://www.youtube.com/watch?v=..."
youtube-mp3 --browser chrome "https://www.youtube.com/watch?v=..."
```

Generate lyrics and subtitles:

```bash
audio-subtitles "/path/to/song.mp3"
audio-subtitles "/path/to/video.mp4"
audio-subtitles "https://www.youtube.com/watch?v=..."
```

Choose subtitle language:

```bash
audio-subtitles --sub-langs "zh.*,en.*" "https://www.youtube.com/watch?v=..."
audio-subtitles --language zh "/path/to/video.mp4"
```

Force local Whisper:

```bash
audio-subtitles --subtitle-source local "https://www.youtube.com/watch?v=..."
audio-subtitles --force-local "https://www.youtube.com/watch?v=..."
```

Save files elsewhere:

```bash
audio-subtitles --output-dir "/path/to/output" "/path/to/video.mp4"
```

### Outputs

- `.lrc`: synced lyrics.
- `.srt`: video editors and subtitle tools.
- `.vtt`: web playback.
- `.txt`: timestamped text review.
- `.json`: machine-readable cue data.
- `stems/`: vocals and instrumental files when `--separate` is enabled.

### Notes

- Song transcription is harder than speech transcription; choruses, harmonies, reverb, and overlapping vocals often need manual cleanup.
- A clean vocal stem usually improves lyric accuracy more than simply choosing a larger model.
- Only download or process media you have the right to use.
- Browser cookies are login credentials; do not commit or share them.

## More Detail

- Workflow notes: [docs/flow.md](docs/flow.md)
- Desktop app product notes: [docs/desktop-app-prd.md](docs/desktop-app-prd.md)
- Desktop prototype: [apps/desktop](apps/desktop)
- Upstream tools: [yt-dlp](https://github.com/yt-dlp/yt-dlp), [faster-whisper](https://github.com/SYSTRAN/faster-whisper), [audio-separator](https://pypi.org/project/audio-separator/), [Ultimate Vocal Remover GUI](https://github.com/Anjok07/ultimatevocalremovergui)
