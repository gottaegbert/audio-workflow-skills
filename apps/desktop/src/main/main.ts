import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { CommandPreview, JobOptions, JobResult, OutputFormat } from "../shared/types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runningJobs = new Map<string, ChildProcessWithoutNullStreams>();

function audioSubtitlesCommand(): string {
  const localCommand = path.join(homedir(), ".local", "bin", "audio-subtitles");
  return existsSync(localCommand) ? localCommand : "audio-subtitles";
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 980,
    minHeight: 640,
    title: "Audio Workflow",
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
    window.loadURL(process.env.VITE_DEV_SERVER_URL ?? "http://127.0.0.1:5173");
  }
}

app.whenReady().then(() => {
  process.env.PATH = [
    path.join(homedir(), ".local", "bin"),
    "/opt/homebrew/bin",
    "/usr/local/bin",
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
    const preview = buildCommandPreview(options);

    return new Promise((resolve, reject) => {
      const child = spawn(preview.command, preview.args, {
        env: process.env,
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
        reject(error);
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

function buildCommandPreview(options: JobOptions): CommandPreview {
  const command = audioSubtitlesCommand();
  const args = buildAudioSubtitlesArgs(options);
  return {
    command,
    args,
    display: [quoteForDisplay(command), ...args.map(quoteForDisplay)].join(" ")
  };
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

function parseGeneratedOutput(output: string): Pick<JobResult, "outputDir" | "generatedFiles"> {
  const outputDirMatch = output.match(/^Output directory:\s*(.+)$/m);
  const generatedFiles = output
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*-\s+(.+)$/)?.[1])
    .filter((item): item is string => Boolean(item));

  return {
    outputDir: outputDirMatch?.[1]?.trim() ?? "",
    generatedFiles
  };
}

function quoteForDisplay(value: string): string {
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(value)) {
    return value;
  }
  return `'${value.replace(/'/g, "'\\''")}'`;
}
