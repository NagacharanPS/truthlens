import "dotenv/config";
import { spawn } from "node:child_process";
import process from "node:process";

// This file does not replace the FastAPI backend.
// It simply gives npm/nodemon a stable Node entrypoint that starts `main.py`.

const pythonCandidates =
  process.platform === "win32"
    ? [
        [(process.env.BACKEND_PYTHON_COMMAND || "python").trim() || "python", []],
        ["py", ["-3"]],
      ]
    : [[(process.env.BACKEND_PYTHON_COMMAND || "python").trim() || "python", []]];

const backendScript = "main.py";
const npmLifecycleEvent = process.env.npm_lifecycle_event || "";
const isNpmScriptRun = npmLifecycleEvent === "dev" || npmLifecycleEvent === "start";

function buildChildEnv() {
  return {
    ...process.env,
    // When npm launches this wrapper, we keep Uvicorn in single-process mode.
    // That avoids Windows permission issues from extra reload worker processes.
    BACKEND_RELOAD: isNpmScriptRun ? "false" : process.env.BACKEND_RELOAD || "false",
  };
}

function forwardSignal(childProcess, signal) {
  if (!childProcess.killed) {
    childProcess.kill(signal);
  }
}

function launchBackend(candidateIndex = 0) {
  const candidate = pythonCandidates[candidateIndex];

  if (!candidate) {
    console.error("Unable to start the TruthLens backend. Install Python or set BACKEND_PYTHON_COMMAND.");
    process.exit(1);
  }

  const [command, commandArgs] = candidate;
  const childProcess = spawn(command, [...commandArgs, backendScript], {
    cwd: process.cwd(),
    env: buildChildEnv(),
    stdio: "inherit",
  });

  childProcess.on("error", (error) => {
    if (error.code === "ENOENT" && candidateIndex + 1 < pythonCandidates.length) {
      launchBackend(candidateIndex + 1);
      return;
    }

    console.error(`Failed to start backend with "${command}": ${error.message}`);
    process.exit(1);
  });

  childProcess.on("close", (code) => {
    process.exit(code ?? 0);
  });

  process.on("SIGINT", () => forwardSignal(childProcess, "SIGINT"));
  process.on("SIGTERM", () => forwardSignal(childProcess, "SIGTERM"));
}

launchBackend();
