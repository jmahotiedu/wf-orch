# Portfolio Notes: Workflow Orchestrator

## What I Built

I built a distributed workflow orchestration system with a TypeScript control plane, Redis Streams dispatch, Postgres-backed run/task state, and a worker fleet that uses lease + heartbeat semantics for safe recovery.

Core capabilities:

- Workflow authoring with DAG validation and persisted definitions.
- Triggered and cron-scheduled runs with idempotency keys.
- Worker execution with retries, exponential backoff, and dead-letter routing.
- Run cancellation and a live SSE feed for run/task updates.
- Dashboard for runs, tasks, failures, and operational inspection.
- Prometheus telemetry for API and worker behavior.

## Tradeoffs I Chose

### At-Least-Once Delivery (Not Exactly-Once)

- Why: simpler, practical reliability for most background jobs.
- Cost: handlers must be idempotent or replay-safe.

### Redis Streams + Postgres Split

- Why: low-latency queue operations plus durable source-of-truth state.
- Cost: more reconciliation logic between transient queue state and durable DB state.

### Lease-Based Recovery

- Why: deterministic crash recovery with bounded stale task windows.
- Cost: requires careful lease/heartbeat tuning by workload profile.

## Incident Story (Crash Drill)

During a controlled drill on 2026-02-12, I terminated all worker processes while runs were active. Tasks stopped heartbeating, leases expired, and the reaper pushed affected tasks back into retry/dead-letter paths. After restarting workers, the system drained pending work and reached terminal run states without stuck `running` tasks or duplicate run creation. See `docs/postmortems/2026-02-12-worker-crash-drill.md`.

## Measured Outcomes (Evidence-Backed)

- Benchmark throughput: **1.57 runs/sec** over 25 runs in 15.94s, with **25 succeeded / 0 failed** (`bench/results/latest.json`, `bench/results/latest.md`).
- Reliability drill: worker crash scenario recovered without stuck `running` tasks and without duplicate run creation (`docs/postmortems/2026-02-12-worker-crash-drill.md`).
- Verification surface: unit + integration coverage across DAG/state machine, idempotent trigger behavior, and worker retry/recovery (`shared/tests/dag.test.ts`, `shared/tests/stateMachine.test.ts`, `control-plane/tests/idempotency.integration.test.ts`, `worker/tests/retry.integration.test.ts`).

## Evidence Index

| Portfolio Claim | Repository Evidence |
| --- | --- |
| Safe orchestration with DAG validation and run/task lifecycle control | `shared/src/dag.ts`, `shared/src/stateMachine.ts`, `shared/tests/dag.test.ts`, `shared/tests/stateMachine.test.ts` |
| Idempotent trigger path for external integrations | `control-plane/src/api/routes.ts`, `control-plane/tests/idempotency.integration.test.ts`, `control-plane/migrations/001_init.sql` |
| Lease + heartbeat crash recovery semantics | `worker/src/executor.ts`, `control-plane/src/recovery/reaper.ts`, `docs/postmortems/2026-02-12-worker-crash-drill.md` |
| Operator-facing observability and triage workflow | `control-plane/src/metrics/metrics.ts`, `docs/runbook.md`, `docs/assets/dashboard-runs.png`, `docs/assets/dashboard-tasks.png` |
| Reproducible benchmark reporting | `bench/src/runBenchmark.ts`, `bench/results/latest.json`, `bench/results/latest.md` |

## What I Would Do Next

1. Add tenant isolation and quota enforcement.
2. Add stronger alerting (SLO burn-rate alerts, queue lag alerts).
3. Introduce a plugin SDK for custom task executors.
4. Add deterministic replay/simulation mode for workflow debugging.
5. Support remote object storage for large payload attachments.

## Resume / Portfolio Site Bullets

- Built a distributed workflow orchestrator (TypeScript, Postgres, Redis Streams) that completed **25/25 benchmark runs** in **15.94s** (**1.57 runs/s**) with reproducible artifacts (`bench/results/latest.json`).
- Implemented lease + heartbeat worker recovery with retry/backoff + dead-letter routing, validated in a controlled crash drill with no stuck running tasks (`docs/postmortems/2026-02-12-worker-crash-drill.md`).
- Shipped operator-facing API/UI observability with Prometheus metrics, run/task dashboards, and an on-call runbook for queue backlog, failure spikes, and rollback (`docs/runbook.md`, `docs/assets/dashboard-runs.png`).
