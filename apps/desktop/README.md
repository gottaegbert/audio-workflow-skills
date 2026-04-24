# Audio Workflow Desktop

Prototype Electron app for the `audio-subtitles` CLI.

The app is intentionally a thin shell:

- UI handles input, settings, queue, logs, and output discovery.
- Processing stays in `audio-subtitles`.
- YouTube captions are still the default path for YouTube URLs.
- Local Whisper and source separation are opt-in from the UI.

## Run Locally

Install the root CLI first:

```bash
cd ../..
./install.sh
```

Install desktop dependencies:

```bash
cd apps/desktop
npm install
```

Start the app:

```bash
npm run dev
```

The app expects `audio-subtitles` to be on PATH. On macOS, the main process also checks:

```text
~/.local/bin/audio-subtitles
```

## Current Scope

- Paste YouTube URL or select a local file/folder.
- Choose subtitle source: Auto, YouTube, or Local Whisper.
- Optional local fallback.
- Optional source separation.
- Configure model, language, subtitle language selector, browser cookies, output folder, and output formats.
- Run one job at a time with live logs.
- Open output folder or generated files.

## Not Included Yet

- Installer packaging.
- Batch queue execution.
- Timeline lyric editor.
- Model/dependency setup UI.
- Auto-update.
