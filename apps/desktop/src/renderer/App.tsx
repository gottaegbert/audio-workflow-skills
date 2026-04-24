import { type DragEvent, type ReactNode, useEffect, useMemo, useState } from "react";
import type { AudioWorkflowApi, CommandPreview, JobOptions, JobResult, OutputFormat, SubtitleSource } from "../shared/types";

declare global {
  interface Window {
    audioWorkflow: AudioWorkflowApi;
  }
}

type JobStatus = "idle" | "running" | "complete" | "failed" | "canceled";

interface JobRecord {
  id: string;
  input: string;
  status: JobStatus;
  startedAt: string;
  result?: JobResult;
}

const allFormats: OutputFormat[] = ["lrc", "srt", "vtt", "txt", "json"];

const defaultOptions: JobOptions = {
  input: "",
  outputDir: "",
  subtitleSource: "auto",
  localFallback: false,
  separate: false,
  saveAudio: false,
  keepPlatformSubs: false,
  model: "medium",
  language: "",
  subLangs: "",
  browser: "",
  cookies: "",
  formats: allFormats
};

export default function App() {
  const [options, setOptions] = useState<JobOptions>(defaultOptions);
  const [preview, setPreview] = useState<CommandPreview | null>(null);
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [logs, setLogs] = useState("");
  const [statusMessage, setStatusMessage] = useState("Ready");

  const activeJob = useMemo(
    () => jobs.find((job) => job.id === activeJobId) ?? jobs[0] ?? null,
    [activeJobId, jobs]
  );
  const runningJob = useMemo(() => jobs.find((job) => job.status === "running") ?? null, [jobs]);

  const isRunning = Boolean(runningJob);

  useEffect(() => {
    const stopListening = window.audioWorkflow.onJobLog((log) => {
      setLogs((current) => current + log.chunk);
    });
    return stopListening;
  }, []);

  useEffect(() => {
    let ignore = false;

    if (!options.input.trim()) {
      setPreview(null);
      return;
    }

    window.audioWorkflow
      .previewCommand(options)
      .then((nextPreview) => {
        if (!ignore) {
          setPreview(nextPreview);
        }
      })
      .catch((error: Error) => {
        if (!ignore) {
          setPreview(null);
          setStatusMessage(error.message);
        }
      });

    return () => {
      ignore = true;
    };
  }, [options]);

  function updateOptions(update: Partial<JobOptions>) {
    setOptions((current) => ({ ...current, ...update }));
  }

  async function chooseInput() {
    const selected = await window.audioWorkflow.selectInput();
    if (selected) {
      updateOptions({ input: selected });
    }
  }

  async function chooseOutputDir() {
    const selected = await window.audioWorkflow.selectOutputDir();
    if (selected) {
      updateOptions({ outputDir: selected });
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const firstFile = event.dataTransfer.files.item(0) as (File & { path?: string }) | null;
    if (firstFile?.path) {
      updateOptions({ input: firstFile.path });
    }
  }

  async function runJob() {
    if (!options.input.trim() || isRunning) {
      return;
    }

    const jobId = crypto.randomUUID();
    const nextJob: JobRecord = {
      id: jobId,
      input: options.input,
      status: "running",
      startedAt: new Date().toLocaleTimeString()
    };

    setJobs((current) => [nextJob, ...current]);
    setActiveJobId(jobId);
    setLogs("");
    setStatusMessage("Running");

    try {
      const result = await window.audioWorkflow.runJob(jobId, options);
      const nextStatus = statusFromResult(result);
      setJobs((current) =>
        current.map((job) =>
          job.id === jobId
            ? {
                ...job,
                status: nextStatus,
                result
              }
            : job
        )
      );
      setStatusMessage(nextStatus === "complete" ? "Complete" : nextStatus === "canceled" ? "Canceled" : `Failed with exit code ${result.exitCode ?? "unknown"}`);
    } catch (error) {
      setJobs((current) =>
        current.map((job) =>
          job.id === jobId
            ? {
                ...job,
                status: "failed"
              }
            : job
        )
      );
      setStatusMessage(error instanceof Error ? error.message : "Failed");
    }
  }

  async function cancelJob() {
    if (!runningJob) {
      return;
    }
    const canceled = await window.audioWorkflow.cancelJob(runningJob.id);
    if (canceled) {
      setJobs((current) => current.map((job) => (job.id === runningJob.id ? { ...job, status: "canceled" } : job)));
      setStatusMessage("Canceled");
    }
  }

  function toggleFormat(format: OutputFormat) {
    const nextFormats = options.formats.includes(format)
      ? options.formats.filter((item) => item !== format)
      : [...options.formats, format];
    updateOptions({ formats: nextFormats });
  }

  return (
    <main className="appShell">
      <section className="topBar">
        <div>
          <p className="eyebrow">Audio Workflow</p>
          <h1>Subtitle and karaoke package maker</h1>
        </div>
        <div className="statusPill" data-state={activeJob?.status ?? "idle"}>
          {statusMessage}
        </div>
      </section>

      <section className="inputBand" onDrop={handleDrop} onDragOver={(event) => event.preventDefault()}>
        <label className="inputLabel" htmlFor="input">
          YouTube URL, audio/video file, or UVR folder
        </label>
        <div className="inputRow">
          <input
            id="input"
            value={options.input}
            onChange={(event) => updateOptions({ input: event.target.value })}
            placeholder="Paste a YouTube URL or drop a local file here"
          />
          <button type="button" className="secondaryButton" onClick={chooseInput}>
            Select
          </button>
          <button type="button" className="primaryButton" onClick={runJob} disabled={!options.input.trim() || isRunning}>
            Run
          </button>
          <button type="button" className="secondaryButton" onClick={cancelJob} disabled={!isRunning}>
            Stop
          </button>
        </div>
      </section>

      <section className="workspace">
        <aside className="queuePane">
          <div className="paneHeader">
            <h2>Queue</h2>
            <span>{jobs.length}</span>
          </div>
          <div className="queueList">
            {jobs.length === 0 ? (
              <p className="emptyText">No jobs yet.</p>
            ) : (
              jobs.map((job) => (
                <button
                  key={job.id}
                  type="button"
                  className="queueItem"
                  data-active={job.id === activeJobId}
                  onClick={() => setActiveJobId(job.id)}
                >
                  <span className="queueTitle">{job.input}</span>
                  <span className="queueMeta">
                    {job.status} - {job.startedAt}
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="detailPane">
          <div className="settingsGrid">
            <Field label="Subtitle source">
              <SegmentedControl
                value={options.subtitleSource}
                options={[
                  ["auto", "Auto"],
                  ["youtube", "YouTube"],
                  ["local", "Local"]
                ]}
                onChange={(value) => updateOptions({ subtitleSource: value })}
              />
            </Field>

            <Field label="Whisper model">
              <select value={options.model} onChange={(event) => updateOptions({ model: event.target.value })}>
                <option value="small">small</option>
                <option value="medium">medium</option>
                <option value="large-v3-turbo">large-v3-turbo</option>
                <option value="large-v3">large-v3</option>
              </select>
            </Field>

            <Field label="Language">
              <input
                value={options.language}
                onChange={(event) => updateOptions({ language: event.target.value })}
                placeholder="Auto, en, zh, ja"
              />
            </Field>

            <Field label="YouTube subtitle languages">
              <input
                value={options.subLangs}
                onChange={(event) => updateOptions({ subLangs: event.target.value })}
                placeholder="Auto, zh.*,en.*"
              />
            </Field>

            <Field label="Browser cookies">
              <input
                value={options.browser}
                onChange={(event) => updateOptions({ browser: event.target.value })}
                placeholder="chrome or safari"
              />
            </Field>

            <Field label="cookies.txt">
              <input
                value={options.cookies}
                onChange={(event) => updateOptions({ cookies: event.target.value })}
                placeholder="/path/to/cookies.txt"
              />
            </Field>
          </div>

          <div className="switchGrid">
            <Checkbox
              label="Local fallback"
              checked={options.localFallback}
              onChange={(checked) => updateOptions({ localFallback: checked })}
            />
            <Checkbox label="Separate vocals" checked={options.separate} onChange={(checked) => updateOptions({ separate: checked })} />
            <Checkbox label="Keep raw VTT" checked={options.keepPlatformSubs} onChange={(checked) => updateOptions({ keepPlatformSubs: checked })} />
            <Checkbox label="Keep extracted audio" checked={options.saveAudio} onChange={(checked) => updateOptions({ saveAudio: checked })} />
          </div>

          <div className="formatRow" aria-label="Output formats">
            {allFormats.map((format) => (
              <button
                key={format}
                type="button"
                className="formatButton"
                data-selected={options.formats.includes(format)}
                onClick={() => toggleFormat(format)}
              >
                {format.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="outputRow">
            <label htmlFor="output">Output folder</label>
            <input
              id="output"
              value={options.outputDir}
              onChange={(event) => updateOptions({ outputDir: event.target.value })}
              placeholder="Default output folder"
            />
            <button type="button" className="secondaryButton" onClick={chooseOutputDir}>
              Choose
            </button>
          </div>

          <section className="commandPane">
            <div className="paneHeader">
              <h2>Command</h2>
            </div>
            <pre>{preview?.display ?? "Enter input to preview the CLI command."}</pre>
          </section>

          <section className="resultPane">
            <div className="resultHeader">
              <h2>Output</h2>
              <div className="resultActions">
                <button
                  type="button"
                  className="secondaryButton"
                  disabled={!activeJob?.result?.outputDir}
                  onClick={() => activeJob?.result?.outputDir && window.audioWorkflow.openPath(activeJob.result.outputDir)}
                >
                  Open folder
                </button>
              </div>
            </div>
            {activeJob?.result?.generatedFiles.length ? (
              <ul className="fileList">
                {activeJob.result.generatedFiles.map((file) => (
                  <li key={file}>
                    <button type="button" onClick={() => window.audioWorkflow.openPath(file)}>
                      {file}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="emptyText">Generated files will appear here.</p>
            )}
          </section>

          <section className="logPane">
            <div className="paneHeader">
              <h2>Logs</h2>
            </div>
            <pre>{logs || "Logs will stream here while a job is running."}</pre>
          </section>
        </section>
      </section>
    </main>
  );
}

function statusFromResult(result: JobResult): JobStatus {
  if (result.signal === "SIGTERM") {
    return "canceled";
  }
  return result.exitCode === 0 ? "complete" : "failed";
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="checkboxLabel">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function SegmentedControl({
  value,
  options,
  onChange
}: {
  value: SubtitleSource;
  options: [SubtitleSource, string][];
  onChange: (value: SubtitleSource) => void;
}) {
  return (
    <div className="segmentedControl">
      {options.map(([optionValue, label]) => (
        <button
          key={optionValue}
          type="button"
          data-selected={value === optionValue}
          onClick={() => onChange(optionValue)}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
