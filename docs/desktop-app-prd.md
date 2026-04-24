# Desktop App PRD

## Product Intent

Create a desktop app that turns YouTube links, video files, audio files, or UVR stems into practical singing and subtitle assets without requiring CLI knowledge.

Primary output:

- Synced lyrics for singing practice.
- Subtitle files for video workflows.
- Optional instrumental/vocal stems for DAWs.

The CLI remains the source of truth. The desktop app should orchestrate existing commands instead of reimplementing media processing.

## Target Users

- Designers, creators, musicians, and karaoke users who are comfortable dragging files but not comfortable debugging CLI tools.
- Video editors who need quick `.srt` / `.vtt` files.
- Singers who want `.lrc` lyrics and an instrumental backing track.
- Technical users who still want CLI parity and reproducible output.

## MVP Scope

### Inputs

- YouTube URL.
- Local video file.
- Local audio file.
- UVR output folder.

### Core Actions

- Detect input type.
- Prefer YouTube captions for YouTube URLs.
- Fall back to local transcription only when selected.
- Optional vocal separation.
- Show job progress and logs.
- Open output folder.

### Outputs

- `.lrc`
- `.srt`
- `.vtt`
- `.txt`
- `.json`
- Optional `stems/` folder with vocals and instrumental.

## Non-Goals for MVP

- No full DAW integration.
- No cloud processing.
- No account system.
- No built-in YouTube browser.
- No destructive editing of source media.
- No advanced lyric editor in the first release.

## First Screen

The first screen should be the working surface, not a marketing landing page.

Recommended layout:

```text
+--------------------------------------------------------------+
| Audio Workflow                                               |
| [URL input or file drop target] [Run]                         |
+----------------------+---------------------------------------+
| Queue                | Job Detail                             |
| - Song A             | Input                                  |
| - Song B             | Subtitle source: YouTube / Local       |
| - Song C             | Separation: Off / On                   |
|                      | Model: medium                          |
|                      | Output formats: LRC SRT VTT TXT JSON   |
|                      | [Open output folder] [Reveal logs]     |
+----------------------+---------------------------------------+
```

## User Flow

```mermaid
flowchart TD
  A["Drop file or paste URL"] --> B["Create job"]
  B --> C{"YouTube URL?"}
  C -->|Yes| D["Check captions"]
  D --> E{"Captions found?"}
  E -->|Yes| F["Convert captions"]
  E -->|No| G{"Local fallback enabled?"}
  G -->|Yes| H["Download audio"]
  G -->|No| I["Show actionable message"]
  C -->|No| J["Prepare local media"]
  H --> K{"Separation enabled?"}
  J --> K
  K -->|Yes| L["Separate stems"]
  K -->|No| M["Transcribe source"]
  L --> N["Transcribe vocals"]
  M --> O["Write outputs"]
  N --> O
  F --> O
  O --> P["Open / reveal output"]
```

## Settings

### Subtitle Source

- Auto: YouTube captions first, no local fallback unless enabled.
- YouTube only.
- Local Whisper.

### Language

- Auto.
- Preferred language selector, e.g. `en`, `zh.*`, `ja`.

### Local Model

- `small`
- `medium`
- `large-v3-turbo`
- `large-v3`

### Separation

- Off by default.
- On for vocal/instrumental package.
- Advanced model selector hidden behind an advanced section.

### Output

- Output folder.
- Keep raw YouTube VTT.
- Keep extracted audio.
- Keep stems.

## Technical Architecture

Recommended stack:

- Electron for desktop shell.
- React for UI.
- A small Node process wrapper around CLI commands.
- Existing CLI scripts as the stable processing layer.

```mermaid
flowchart LR
  UI["Electron + React UI"] --> IPC["IPC command layer"]
  IPC --> CLI["audio-subtitles / youtube-mp3"]
  CLI --> YTDLP["yt-dlp"]
  CLI --> FFMPEG["ffmpeg"]
  CLI --> WHISPER["faster-whisper"]
  CLI --> SEP["audio-separator"]
  CLI --> FS["Output files"]
  FS --> UI
```

### Why Keep CLI as Core

- CLI users and app users share one implementation.
- Easier debugging.
- Easier automation.
- Safer upgrades for `yt-dlp`, `ffmpeg`, Whisper, and separation tooling.

## Job State Model

Suggested states:

- `queued`
- `reading_metadata`
- `downloading_subtitles`
- `downloading_audio`
- `separating`
- `transcribing`
- `writing_outputs`
- `complete`
- `failed`

Each job should store:

- input URL/path
- resolved media title
- selected subtitle source
- selected language
- output directory
- generated files
- raw logs
- failure reason

## Error Copy

Errors should be specific and action-oriented:

- YouTube asked for sign-in: ask user to retry with browser cookies.
- No captions found: offer local fallback.
- Local model missing: offer setup command.
- Separation dependency missing: offer setup command and warn about size.
- Rate limited: tell user the app downloads one subtitle by default and suggest retrying later or changing language.

## Design Direction

The app should feel like a focused production tool:

- Quiet, dense, and practical.
- Clear queue and status feedback.
- No large marketing hero.
- No decorative visual noise.
- High confidence around where files are saved.
- Logs available but not front-and-center.

## Later Features

- Timeline lyric editor.
- Manual cue splitting and merge.
- One-click karaoke package export.
- Batch jobs.
- Presets for video editor, karaoke, and DAW use.
- Watch folder.
- App-level model cache manager.
- Optional waveform preview.
