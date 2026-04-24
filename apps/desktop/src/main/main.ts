import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn, type ChildProcessByStdio } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import type { CommandPreview, JobOptions, JobResult, OutputFormat } from "../shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runningJobs = new Map<string, ChildProcessByStdio<null, Readable, Readable>>();

interface CommandInvocation {
  command: string;
  argsPrefix: string[];
}

interface PreparedRuntime {
  env: NodeJS.ProcessEnv;
  python?: CommandInvocation;
}

interface RuntimeNeeds {
  ytDlp: boolean;
  whisper: boolean;
  separator: boolean;
}

type RuntimeLog = (chunk: string) => void;

const runtimePackageChecks = {
  ytDlp: "import importlib.util; raise SystemExit(0 if importlib.util.find_spec('yt_dlp') else 1)",
  whisper: "import importlib.util; raise SystemExit(0 if importlib.util.find_spec('faster_whisper') else 1)",
  separator: "import importlib.util; raise SystemExit(0 if importlib.util.find_spec('audio_separator') else 1)"
};

const runtimePackages = {
  ytDlp: "yt-dlp",
  whisper: "faster-whisper",
  separator: "audio-separator[cpu]"
};

function audioSubtitlesInvocation(runtime?: PreparedRuntime): CommandInvocation {
  const bundledScript = bundledAudioSubtitlesScript();
  if (bundledScript && runtime?.python) {
    return {
      command: runtime.python.command,
      argsPrefix: [...runtime.python.argsPrefix, bundledScript]
    };
  }

  if (bundledScript && app.isPackaged) {
    const python = pythonInvocation();
    if (!python) {
      throw new Error("VocalFlow Studio could not find its bundled Python runtime. Reinstall the app and try again.");
    }
    return {
      command: python.command,
      argsPrefix: [...python.argsPrefix, bundledScript]
    };
  }

  const localCommand = path.join(homedir(), ".local", "bin", "audio-subtitles");
  if (existsSync(localCommand)) {
    return { command: localCommand, argsPrefix: [] };
  }

  const pathCommand = findExecutable("audio-subtitles");
  if (pathCommand) {
    return { command: pathCommand, argsPrefix: [] };
  }

  if (bundledScript) {
    const python = pythonInvocation();
    if (!python) {
      throw new Error(
        "VocalFlow Studio includes its audio-subtitles script, but Python 3 was not found. Reinstall the app or install Python 3 and try again."
      );
    }
    return {
      command: python.command,
      argsPrefix: [...python.argsPrefix, bundledScript]
    };
  }

  throw new Error(
    "audio-subtitles was not found. Install the CLI with ./install.sh, or reinstall VocalFlow Studio so the bundled audio-subtitles script is included."
  );
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    title: "VocalFlow Studio",
    backgroundColor: "#f7f7f3",
    webPreferences: {
      preload: path.join(__dirname, "../preload/preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (app.isPackaged) {
    window.loadFile(path.join(__dirname, "../renderer/index.html"));
  } else {
    window.loadURL(process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5174");
  }
}

app.whenReady().then(() => {
  process.env.PATH = [
    path.join(homedir(), ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    process.env.PATH ?? ""
  ].join(path.delimiter);

  registerIpcHandlers();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  for (const child of runningJobs.values()) {
    child.kill("SIGTERM");
  }
  runningJobs.clear();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

function registerIpcHandlers(): void {
  ipcMain.handle("dialog:select-input", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile", "openDirectory"],
      filters: [
        { name: "Media", extensions: ["mp3", "wav", "m4a", "flac", "aac", "mp4", "mov", "mkv", "webm"] },
        { name: "All Files", extensions: ["*"] }
      ]
    });

    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle("dialog:select-output-dir", async () => {
    const result = await dialog.showOpenDialog({
      properties: ["openDirectory", "createDirectory"]
    });

    return result.canceled ? null : result.filePaths[0] ?? null;
  });

  ipcMain.handle("job:preview-command", (_event, options: JobOptions): CommandPreview => {
    return buildCommandPreview(options);
  });

  ipcMain.handle("job:run", async (event, jobId: string, options: JobOptions): Promise<JobResult> => {
    const runtime = await prepareAudioRuntime(options, (chunk) => {
      event.sender.send("job:log", { jobId, stream: "stderr", chunk });
    });
    const preview = buildCommandPreview(options, runtime);

    return new Promise((resolve, reject) => {
      const child = spawn(preview.command, preview.args, {
        env: runtime.env,
        stdio: ["ignore", "pipe", "pipe"]
      });

      runningJobs.set(jobId, child);

      let output = "";

      child.stdout.on("data", (buffer: Buffer) => {
        const chunk = buffer.toString();
        output += chunk;
        event.sender.send("job:log", { jobId, stream: "stdout", chunk });
      });

      child.stderr.on("data", (buffer: Buffer) => {
        const chunk = buffer.toString();
        output += chunk;
        event.sender.send("job:log", { jobId, stream: "stderr", chunk });
      });

      child.on("error", (error) => {
        runningJobs.delete(jobId);
        reject(new Error(formatSpawnError(error, preview.command)));
      });

      child.on("close", (exitCode, signal) => {
        runningJobs.delete(jobId);
        const parsed = parseGeneratedOutput(output);
        resolve({
          jobId,
          exitCode,
          signal,
          outputDir: parsed.outputDir,
          generatedFiles: parsed.generatedFiles
        });
      });
    });
  });

  ipcMain.handle("job:cancel", (_event, jobId: string) => {
    const child = runningJobs.get(jobId);
    if (!child) {
      return false;
    }
    child.kill("SIGTERM");
    runningJobs.delete(jobId);
    return true;
  });

  ipcMain.handle("shell:open-path", async (_event, targetPath: string) => {
    if (!targetPath) {
      return;
    }
    await shell.openPath(targetPath);
  });
}

function buildCommandPreview(options: JobOptions, runtime?: PreparedRuntime): CommandPreview {
  const invocation = audioSubtitlesInvocation(runtime);
  const command = invocation.command;
  const args = [...invocation.argsPrefix, ...buildAudioSubtitlesArgs(options)];
  return {
    command,
    args,
    display: [quoteForDisplay(command), ...args.map(quoteForDisplay)].join(" ")
  };
}

async function prepareAudioRuntime(options: JobOptions, log: RuntimeLog): Promise<PreparedRuntime> {
  const pathDirs = [
    venvBinDir(runtimeVenvDir()),
    bundledFfmpegDir(),
    path.join(homedir(), ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin"
  ].filter((item): item is string => Boolean(item));
  const env = withPath(process.env, pathDirs);
  const needs = runtimeNeeds(options);

  if (!needs.ytDlp && !needs.whisper && !needs.separator) {
    return { env };
  }

  const basePython = bundledPythonInvocation() ?? pythonInvocation();
  if (!basePython) {
    throw new Error(
      "VocalFlow Studio could not find Python. Reinstall the app and try again; the installer should include a bundled Python runtime."
    );
  }

  const venvDir = runtimeVenvDir();
  const venvPython = runtimeVenvPython(venvDir);
  mkdirSync(path.dirname(venvDir), { recursive: true });

  if (!existsSync(venvPython)) {
    log("[runtime] Preparing first-run Python environment. This can take a minute.\n");
    await runRuntimeCommand(basePython.command, [...basePython.argsPrefix, "-m", "venv", venvDir], env, log);
  }

  const venvPythonInvocation = { command: venvPython, argsPrefix: [] };
  const runtimeEnv = withPath(
    {
      ...env,
      AUDIO_SUBTITLES_PYTHON: venvPython,
      AUDIO_SUBTITLES_VENV: venvDir,
      PYTHONNOUSERSITE: "1",
      PIP_DISABLE_PIP_VERSION_CHECK: "1"
    },
    pathDirs
  );

  const missingPackages: string[] = [];
  if (needs.ytDlp && !(await pythonCheck(venvPython, runtimePackageChecks.ytDlp, runtimeEnv))) {
    missingPackages.push(runtimePackages.ytDlp);
  }
  if (needs.whisper && !(await pythonCheck(venvPython, runtimePackageChecks.whisper, runtimeEnv))) {
    missingPackages.push(runtimePackages.whisper);
  }
  if (needs.separator && !(await pythonCheck(venvPython, runtimePackageChecks.separator, runtimeEnv))) {
    missingPackages.push(runtimePackages.separator);
  }

  if (missingPackages.length > 0) {
    log(`[runtime] Installing ${missingPackages.join(", ")}. First run may take several minutes.\n`);
    await runRuntimeCommand(venvPython, ["-m", "pip", "install", "--upgrade", "pip", "wheel", "setuptools"], runtimeEnv, log);
    await runRuntimeCommand(venvPython, ["-m", "pip", "install", "--upgrade", ...missingPackages], runtimeEnv, log);
  }

  log("[runtime] Runtime ready.\n");
  return { env: runtimeEnv, python: venvPythonInvocation };
}

function runtimeNeeds(options: JobOptions): RuntimeNeeds {
  const input = options.input.trim();
  const urlInput = isHttpUrl(input);
  const bilibiliInput = isBilibiliUrl(input);
  const needsLocalTranscription =
    !urlInput || options.subtitleSource === "local" || options.localFallback || bilibiliInput || options.separate;

  return {
    ytDlp: urlInput,
    whisper: needsLocalTranscription,
    separator: options.separate
  };
}

function runtimeVenvDir(): string {
  return path.join(app.getPath("userData"), "runtime", "audio-subtitles-venv");
}

function runtimeVenvPython(venvDir: string): string {
  return process.platform === "win32" ? path.join(venvDir, "Scripts", "python.exe") : path.join(venvDir, "bin", "python");
}

function venvBinDir(venvDir: string): string {
  return process.platform === "win32" ? path.join(venvDir, "Scripts") : path.join(venvDir, "bin");
}

function bundledFfmpegDir(): string | null {
  const candidate = app.isPackaged
    ? path.join(process.resourcesPath, "ffmpeg-static")
    : path.resolve(__dirname, "../../node_modules/ffmpeg-static");
  return existsSync(candidate) ? candidate : null;
}

function withPath(baseEnv: NodeJS.ProcessEnv, pathDirs: string[]): NodeJS.ProcessEnv {
  return {
    ...baseEnv,
    PATH: [...pathDirs, baseEnv.PATH ?? ""].join(path.delimiter)
  };
}

function pythonCheck(python: string, code: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(python, ["-c", code], {
      env,
      stdio: ["ignore", "ignore", "ignore"]
    });
    child.on("error", () => resolve(false));
    child.on("close", (exitCode) => resolve(exitCode === 0));
  });
}

function runRuntimeCommand(command: string, args: string[], env: NodeJS.ProcessEnv, log: RuntimeLog): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let output = "";

    child.stdout.on("data", (buffer: Buffer) => {
      const chunk = buffer.toString();
      output += chunk;
      log(chunk);
    });

    child.stderr.on("data", (buffer: Buffer) => {
      const chunk = buffer.toString();
      output += chunk;
      log(chunk);
    });

    child.on("error", (error) => {
      reject(new Error(formatSpawnError(error, command)));
    });

    child.on("close", (exitCode) => {
      if (exitCode === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${exitCode ?? "unknown"} while preparing the runtime.\n${lastOutputLine(output)}`));
    });
  });
}

function lastOutputLine(output: string): string {
  const lines = output.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.at(-1) ?? "";
}

function bundledAudioSubtitlesScript(): string | null {
  const candidates = [
    process.env.VOCALFLOW_AUDIO_SUBTITLES_SCRIPT,
    app.isPackaged
      ? path.join(process.resourcesPath, "audio-subtitles", "scripts", "generate_subtitles.py")
      : path.resolve(__dirname, "../../../../skills/audio-subtitles/scripts/generate_subtitles.py")
  ].filter((candidate): candidate is string => Boolean(candidate));

  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function bundledPythonInvocation(): CommandInvocation | null {
  const root = app.isPackaged
    ? path.join(process.resourcesPath, "python-runtime", "python")
    : path.resolve(__dirname, "../../vendor/python-runtime/python");
  const candidates =
    process.platform === "win32"
      ? [path.join(root, "python.exe")]
      : [path.join(root, "bin", "python3"), path.join(root, "bin", "python")];
  const command = candidates.find((candidate) => existsSync(candidate));
  return command ? { command, argsPrefix: [] } : null;
}

function pythonInvocation(): CommandInvocation | null {
  const bundledPython = bundledPythonInvocation();
  if (bundledPython) {
    return bundledPython;
  }

  const configuredPython = process.env.AUDIO_SUBTITLES_PYTHON;
  if (configuredPython && existsSync(configuredPython)) {
    return { command: configuredPython, argsPrefix: [] };
  }

  const candidates: CommandInvocation[] =
    process.platform === "win32"
      ? [
          { command: "py", argsPrefix: ["-3"] },
          { command: "python", argsPrefix: [] },
          { command: "python3", argsPrefix: [] }
        ]
      : [
          { command: "python3", argsPrefix: [] },
          { command: "python", argsPrefix: [] }
        ];

  for (const candidate of candidates) {
    const command = findExecutable(candidate.command);
    if (command) {
      return { command, argsPrefix: candidate.argsPrefix };
    }
  }

  return null;
}

function findExecutable(command: string): string | null {
  if (command.includes("/") || command.includes("\\")) {
    return existsSync(command) ? command : null;
  }

  const extensions = process.platform === "win32" ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM").split(";") : [""];
  const directories = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);

  for (const directory of directories) {
    for (const extension of extensions) {
      const candidate = path.join(directory, `${command}${extension}`);
      if (existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return null;
}

function formatSpawnError(error: Error, command: string): string {
  const code = "code" in error ? String((error as NodeJS.ErrnoException).code) : "";
  if (code === "ENOENT") {
    return `Unable to start ${command}: executable not found. Install Python 3 and the runtime dependencies from the README, then try again.`;
  }
  if (code === "EACCES") {
    return `Unable to start ${command}: permission denied. Check executable permissions and try again.`;
  }
  return error.message;
}

function buildAudioSubtitlesArgs(options: JobOptions): string[] {
  const input = options.input.trim();
  if (!input) {
    throw new Error("Input is required.");
  }

  const formats = normalizeFormats(options.formats);
  const args: string[] = [];

  if (options.outputDir.trim()) {
    args.push("--output-dir", options.outputDir.trim());
  }

  args.push("--subtitle-source", options.subtitleSource);
  args.push("--model", options.model || "medium");
  args.push("--formats", formats.join(","));

  if (options.language.trim()) {
    args.push("--language", options.language.trim());
  }
  if (options.subLangs.trim()) {
    args.push("--sub-langs", options.subLangs.trim());
  }
  if (options.browser.trim()) {
    args.push("--browser", options.browser.trim());
  }
  if (options.cookies.trim()) {
    args.push("--cookies", options.cookies.trim());
  }
  if (options.localFallback) {
    args.push("--local-fallback");
  }
  if (options.separate) {
    args.push("--separate");
    args.push("--separator-format", "MP3");
  }
  if (options.saveAudio) {
    args.push("--save-audio");
  }
  if (options.keepPlatformSubs) {
    args.push("--keep-platform-subs");
  }

  args.push(input);
  return args;
}

function normalizeFormats(formats: OutputFormat[]): OutputFormat[] {
  const fallback: OutputFormat[] = ["srt", "vtt", "lrc", "txt", "json"];
  const allowed = new Set(fallback);
  const selected = formats.filter((format) => allowed.has(format));
  return selected.length > 0 ? selected : fallback;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isBilibiliUrl(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase();
    return host === "b23.tv" || host === "bilibili.com" || host.endsWith(".bilibili.com");
  } catch {
    return false;
  }
}

function parseGeneratedOutput(output: string): Pick<JobResult, "outputDir" | "generatedFiles"> {
  const outputDirMatch = output.match(/^Output directory:\s*(.+)$/m);
  const generatedFiles = output
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      return trimmed.match(/^\s*-\s+(.+)$/)?.[1] ?? (looksLikeGeneratedFile(trimmed) ? trimmed : null);
    })
    .filter((item): item is string => Boolean(item));

  return {
    outputDir: outputDirMatch?.[1]?.trim() ?? "",
    generatedFiles
  };
}

function looksLikeGeneratedFile(value: string): boolean {
  return /\.(srt|vtt|lrc|txt|json|mp3|wav|m4a|flac)$/i.test(value) && (path.isAbsolute(value) || value.includes(path.sep));
}

function quoteForDisplay(value: string): string {
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}
