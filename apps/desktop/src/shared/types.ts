export type SubtitleSource = "auto" | "platform" | "local";

export type OutputFormat = "lrc" | "srt" | "vtt" | "txt" | "json";

export interface JobOptions {
  input: string;
  outputDir: string;
  subtitleSource: SubtitleSource;
  localFallback: boolean;
  separate: boolean;
  saveAudio: boolean;
  keepPlatformSubs: boolean;
  model: string;
  language: string;
  subLangs: string;
  browser: string;
  cookies: string;
  formats: OutputFormat[];
}

export interface CommandPreview {
  command: string;
  args: string[];
  display: string;
}

export interface JobLog {
  jobId: string;
  stream: "stdout" | "stderr";
  chunk: string;
}

export interface JobResult {
  jobId: string;
  exitCode: number | null;
  signal: string | null;
  outputDir: string;
  generatedFiles: string[];
}

export interface AudioWorkflowApi {
  selectInput: () => Promise<string | null>;
  selectOutputDir: () => Promise<string | null>;
  previewCommand: (options: JobOptions) => Promise<CommandPreview>;
  runJob: (jobId: string, options: JobOptions) => Promise<JobResult>;
  cancelJob: (jobId: string) => Promise<boolean>;
  openPath: (targetPath: string) => Promise<void>;
  onJobLog: (callback: (log: JobLog) => void) => () => void;
}
