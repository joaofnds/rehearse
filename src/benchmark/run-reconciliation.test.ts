import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RunManifest } from "./manifest";
import { writeRunManifest } from "./manifest";
import type { ReconciliationDependencies } from "./run-reconciliation";
import {
	liveReconciliationDependencies,
	reconcileInterruptedRuns,
} from "./run-reconciliation";
import { openRunEventStore } from "./run-events";
import { benchmarkRunPaths } from "./run-layout";
import { assertSourceReady, claimTarget } from "./target";
import { TEST_TARGET, TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

function manifestFixture(sourceRoot: string): RunManifest {
	return {
		caseId: "audit-log",
		timestamp: "2026-08-30T00:00:00.000Z",
		controlSha: "control-sha",
		sourceRoot,
		sourceSha: "source-sha",
		taskId: "TASK-1",
		taskSha: "task-sha",
		task: "Task text",
		productBrief: "Brief text",
		model: "sonnet",
		judgeModel: "opus",
		sessionBudgetUsd: 5,
		pipeline: {
			statuses: ["To Do", "Done"],
			target: TEST_TARGET,
			stages: [
				{
					name: "build",
					kind: "delivery",
					skill: "build",
					rubric: "rubrics/build.json",
				},
			],
		},
		pipelinePath: "pipelines/default.json",
	};
}

interface FakeDependencies {
	readonly artifactFiles: Set<string>;
	readonly manifests: Map<string, { readonly sourceRoot: string }>;
	readonly markers: Map<string, { readonly pid: number }>;
	readonly alivePids: Set<number>;
}

function fakeDependencies(
	runsDirectory: string,
	overrides: Partial<FakeDependencies> = {},
): ReconciliationDependencies {
	const artifactFiles = overrides.artifactFiles ?? new Set<string>();
	const manifests = overrides.manifests ?? new Map();
	const markers = overrides.markers ?? new Map();
	const alivePids = overrides.alivePids ?? new Set<number>();

	return {
		runsDirectory,
		artifactExists: (path: string) => Promise.resolve(artifactFiles.has(path)),
		loadManifest: (path: string) => Promise.resolve(manifests.get(path)),
		readMarker: (root: string) => Promise.resolve(markers.get(root)),
		isAlive: (pid: number) => alivePids.has(pid),
	};
}

describe(reconcileInterruptedRuns.name, () => {
	it("reconciles a run to INTERRUPTED when its claimed target's pid is dead and no terminal record exists", async () => {
		const store = await openRunEventStore(":memory:");
		store.append({
			runId: "run-1",
			kind: "stage-started",
			stage: "shape",
			spentUsd: 0,
			elapsedMs: 0,
		});
		const dependencies = fakeDependencies("/runs", {
			manifests: new Map([
				["/runs/run-1.checkpoints/manifest.json", { sourceRoot: "/target" }],
			]),
			markers: new Map([["/target", { pid: 4242 }]]),
			alivePids: new Set(),
		});

		const reconciled = await reconcileInterruptedRuns(store, dependencies);

		expect(reconciled).toEqual(["run-1"]);
		expect(store.latestEvent("run-1")?.kind).toBe("run-interrupted");
		store.close();
	});

	it("carries the run spend and tokens of the run's last event onto its interruption", async () => {
		const store = await openRunEventStore(":memory:");
		store.append({
			runId: "run-1",
			kind: "turn-completed",
			stage: "build",
			spentUsd: 1,
			runSpentUsd: 2.5,
			runTokens: { input: 300, output: 40 },
			elapsedMs: 10,
		});
		const dependencies = fakeDependencies("/runs", {
			manifests: new Map([
				["/runs/run-1.checkpoints/manifest.json", { sourceRoot: "/target" }],
			]),
			markers: new Map([["/target", { pid: 4242 }]]),
		});

		await reconcileInterruptedRuns(store, dependencies);

		expect(store.latestEvent("run-1")).toMatchObject({
			runSpentUsd: 2.5,
			runTokens: { input: 300, output: 40 },
		});
		store.close();
	});

	it("leaves a run alone when its claimed target's pid is still alive", async () => {
		const store = await openRunEventStore(":memory:");
		store.append({
			runId: "run-1",
			kind: "stage-started",
			stage: "shape",
			spentUsd: 0,
			elapsedMs: 0,
		});
		const dependencies = fakeDependencies("/runs", {
			manifests: new Map([
				["/runs/run-1.checkpoints/manifest.json", { sourceRoot: "/target" }],
			]),
			markers: new Map([["/target", { pid: 4242 }]]),
			alivePids: new Set([4242]),
		});

		const reconciled = await reconcileInterruptedRuns(store, dependencies);

		expect(reconciled).toEqual([]);
		expect(store.latestEvent("run-1")?.kind).toBe("stage-started");
		store.close();
	});

	it("leaves a run alone once its terminal record already exists on disk", async () => {
		const store = await openRunEventStore(":memory:");
		store.append({
			runId: "run-1",
			kind: "stage-started",
			stage: "shape",
			spentUsd: 0,
			elapsedMs: 0,
		});
		const dependencies = fakeDependencies("/runs", {
			artifactFiles: new Set(["/runs/run-1.json"]),
		});

		const reconciled = await reconcileInterruptedRuns(store, dependencies);

		expect(reconciled).toEqual([]);
		expect(store.latestEvent("run-1")?.kind).toBe("stage-started");
		store.close();
	});

	it("treats a missing manifest as nothing to reconcile, not an error, since the crash may have preceded it", async () => {
		const store = await openRunEventStore(":memory:");
		store.append({
			runId: "run-1",
			kind: "stage-started",
			stage: "shape",
			spentUsd: 0,
			elapsedMs: 0,
		});
		const dependencies = fakeDependencies("/runs");

		const reconciled = await reconcileInterruptedRuns(store, dependencies);

		expect(reconciled).toEqual([]);
		expect(store.latestEvent("run-1")?.kind).toBe("stage-started");
		store.close();
	});

	it("treats a missing claim marker as nothing to reconcile, since the target may already have been restored", async () => {
		const store = await openRunEventStore(":memory:");
		store.append({
			runId: "run-1",
			kind: "stage-started",
			stage: "shape",
			spentUsd: 0,
			elapsedMs: 0,
		});
		const dependencies = fakeDependencies("/runs", {
			manifests: new Map([
				["/runs/run-1.checkpoints/manifest.json", { sourceRoot: "/target" }],
			]),
		});

		const reconciled = await reconcileInterruptedRuns(store, dependencies);

		expect(reconciled).toEqual([]);
		expect(store.latestEvent("run-1")?.kind).toBe("stage-started");
		store.close();
	});

	it("does not re-reconcile a run already marked INTERRUPTED", async () => {
		const store = await openRunEventStore(":memory:");
		store.append({
			runId: "run-1",
			kind: "run-interrupted",
			stage: "shape",
			spentUsd: 0,
			elapsedMs: 0,
		});
		const dependencies = fakeDependencies("/runs", {
			manifests: new Map([
				["/runs/run-1.checkpoints/manifest.json", { sourceRoot: "/target" }],
			]),
			markers: new Map([["/target", { pid: 4242 }]]),
		});

		const reconciled = await reconcileInterruptedRuns(store, dependencies);

		expect(reconciled).toEqual([]);
		store.close();
	});

	it("reconciles every crashed run among several, independently", async () => {
		const store = await openRunEventStore(":memory:");
		store.append({
			runId: "run-1",
			kind: "stage-started",
			stage: "shape",
			spentUsd: 0,
			elapsedMs: 0,
		});
		store.append({
			runId: "run-2",
			kind: "stage-started",
			stage: "discuss",
			spentUsd: 0,
			elapsedMs: 0,
		});
		const dependencies = fakeDependencies("/runs", {
			manifests: new Map([
				["/runs/run-1.checkpoints/manifest.json", { sourceRoot: "/target-1" }],
				["/runs/run-2.checkpoints/manifest.json", { sourceRoot: "/target-2" }],
			]),
			markers: new Map([
				["/target-1", { pid: 111 }],
				["/target-2", { pid: 222 }],
			]),
			alivePids: new Set([222]),
		});

		const reconciled = await reconcileInterruptedRuns(store, dependencies);

		expect(reconciled.toSorted()).toEqual(["run-1"]);
		store.close();
	});

	it("reconciles the other runs when one run's manifest is corrupt, rather than letting it crash the whole pass", async () => {
		const store = await openRunEventStore(":memory:");
		store.append({
			runId: "run-1",
			kind: "stage-started",
			stage: "shape",
			spentUsd: 0,
			elapsedMs: 0,
		});
		store.append({
			runId: "run-2",
			kind: "stage-started",
			stage: "discuss",
			spentUsd: 0,
			elapsedMs: 0,
		});
		const dependencies: ReconciliationDependencies = {
			...fakeDependencies("/runs", {
				manifests: new Map([
					[
						"/runs/run-2.checkpoints/manifest.json",
						{ sourceRoot: "/target-2" },
					],
				]),
				markers: new Map([["/target-2", { pid: 222 }]]),
				alivePids: new Set(),
			}),
			loadManifest: (path: string) => {
				if (path === "/runs/run-1.checkpoints/manifest.json") {
					throw new Error("malformed manifest.json");
				}

				return Promise.resolve({ sourceRoot: "/target-2" });
			},
		};

		const reconciled = await reconcileInterruptedRuns(store, dependencies);

		expect(reconciled).toEqual(["run-2"]);
		store.close();
	});
});

describe(liveReconciliationDependencies.name, () => {
	it("leaves a run alone when its claimed target's pid is this live test process", async () => {
		const runsDirectory = await mkdtemp(
			join(tmpdir(), "rehearse-reconciliation-"),
		);
		testResources.track(runsDirectory);
		const repository = await testResources.createRepository();
		const source = await assertSourceReady(repository.directory);
		await claimTarget(source);
		const paths = benchmarkRunPaths(runsDirectory, "run-1");
		await writeRunManifest(paths.manifestFile, manifestFixture(source.root));
		const store = await openRunEventStore(":memory:");
		store.append({
			runId: "run-1",
			kind: "stage-started",
			stage: "shape",
			spentUsd: 0,
			elapsedMs: 0,
		});

		const reconciled = await reconcileInterruptedRuns(
			store,
			liveReconciliationDependencies(runsDirectory),
		);

		expect(reconciled).toEqual([]);
		expect(store.latestEvent("run-1")?.kind).toBe("stage-started");
		store.close();
	});

	it("treats a run with no manifest on disk as nothing to reconcile", async () => {
		const runsDirectory = await mkdtemp(
			join(tmpdir(), "rehearse-reconciliation-"),
		);
		testResources.track(runsDirectory);
		const store = await openRunEventStore(":memory:");
		store.append({
			runId: "run-1",
			kind: "stage-started",
			stage: "shape",
			spentUsd: 0,
			elapsedMs: 0,
		});

		const reconciled = await reconcileInterruptedRuns(
			store,
			liveReconciliationDependencies(runsDirectory),
		);

		expect(reconciled).toEqual([]);
		store.close();
	});
});
