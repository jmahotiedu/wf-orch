import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const apiBase = process.env.BENCH_API_BASE ?? "http://localhost:8080/api";
const token = process.env.BENCH_TOKEN ?? "admin-token";
const runCount = Number.parseInt(process.env.BENCH_RUN_COUNT ?? "25", 10);

async function request<T>(target: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBase}${target}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...(init?.headers ?? {})
    }
  });
  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function ensureBenchmarkWorkflow(): Promise<string> {
  const workflowName = "benchmark-workflow";
  const definition = {
    version: 1,
    tasks: [
      { id: "a", name: "start", kind: "noop", config: { durationMs: 25 } },
      { id: "b", name: "fanout-1", kind: "flaky", dependsOn: ["a"], config: { durationMs: 30, failUntilAttempt: 1 } },
      { id: "c", name: "fanout-2", kind: "noop", dependsOn: ["a"], config: { durationMs: 30 } },
      { id: "d", name: "join", kind: "noop", dependsOn: ["b", "c"], config: { durationMs: 20 } }
    ]
  };

  const listed = await request<{ workflows: Array<{ id: string; name: string }> }>("/workflows");
  const existing = listed.workflows.find((workflow) => workflow.name === workflowName);
  if (existing) return existing.id;

  const created = await request<{ workflow: { id: string } }>("/workflows", {
    method: "POST",
    body: JSON.stringify({
      name: workflowName,
      definition,
      maxConcurrentRuns: 100
    })
  });
  return created.workflow.id;
}

async function waitForCompletion(workflowId: string): Promise<Array<{ id: string; status: string }>> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const response = await request<{ runs: Array<{ id: string; status: string }> }>(
      `/runs?workflowId=${workflowId}`
    );
    const recent = response.runs.slice(0, runCount);
    if (recent.length >= runCount && recent.every((run) => ["succeeded", "failed", "cancelled"].includes(run.status))) {
      return recent;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error("Benchmark timeout waiting for run completion.");
}

async function main(): Promise<void> {
  const workflowId = await ensureBenchmarkWorkflow();
  const startedAt = Date.now();

  for (let i = 0; i < runCount; i += 1) {
    await request(`/workflows/${workflowId}/trigger`, {
      method: "POST",
      headers: {
        "Idempotency-Key": `bench-${Date.now()}-${i}`
      },
      body: JSON.stringify({ triggerSource: "event" })
    });
  }

  const runs = await waitForCompletion(workflowId);
  const finishedAt = Date.now();
  const durationSec = (finishedAt - startedAt) / 1000;
  const succeeded = runs.filter((run) => run.status === "succeeded").length;
  const failed = runs.filter((run) => run.status === "failed").length;
  const throughput = runCount / durationSec;

  const report = {
    timestamp: new Date().toISOString(),
    runCount,
    durationSec,
    throughputRunsPerSecond: throughput,
    succeeded,
    failed
  };

  const resultsDir = path.resolve(__dirname, "../results");
  await fs.mkdir(resultsDir, { recursive: true });
  await fs.writeFile(path.join(resultsDir, "latest.json"), JSON.stringify(report, null, 2), "utf8");
  await fs.writeFile(
    path.join(resultsDir, "latest.md"),
    [
      "# Benchmark Report",
      "",
      `- Timestamp: ${report.timestamp}`,
      `- Runs: ${report.runCount}`,
      `- Duration (s): ${report.durationSec.toFixed(2)}`,
      `- Throughput (runs/s): ${report.throughputRunsPerSecond.toFixed(2)}`,
      `- Succeeded: ${report.succeeded}`,
      `- Failed: ${report.failed}`
    ].join("\n"),
    "utf8"
  );

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
