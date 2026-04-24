# VocalFlow Studio Desktop

Prototype Electron app for the `audio-subtitles` CLI.

For bilingual, scenario-based usage docs, see the root [README](../../README.md).

The app is intentionally a thin shell:

- UI handles input, settings, queue, logs, and output discovery.
- Processing stays in `audio-subtitles`.
- Platform captions are still the first path for supported media URLs.
- Bilibili falls back to local Whisper by default when platform subtitles are unavailable.
- Local Whisper and source separation are configurable from the UI.

## Run Locally

Install the root CLI first:

```bash
cd ../..
./install.sh
```

Install desktop dependencies:

```bash
cd apps/desktop
pnpm install
```

Start the app:

```bash
pnpm dev
```

The app expects `audio-subtitles` to be on PATH. On macOS, the main process also checks:

```text
~/.local/bin/audio-subtitles
```

## Current Scope

- Paste YouTube/Bilibili URL or select a local file/folder.
- Choose subtitle source: Auto, Platform, or Local Whisper.
- Optional local fallback.
- Optional source separation.
- Configure model, language, subtitle language selector, browser cookies, output folder, and output formats.
- Run one job at a time with live logs.
- Open output folder or generated files.

## Release Installers

This project uses GitHub Actions to build release installers from version tags:

```bash
git tag v0.1.0
git push origin v0.1.0
```

The workflow uploads:

- macOS `.dmg`
- Windows `.exe`

The packaged app still expects the `audio-subtitles` CLI and runtime dependencies to be installed on the user's machine.

## Not Included Yet

- Batch queue execution.
- Timeline lyric editor.
- Model/dependency setup UI.
- Auto-update.
