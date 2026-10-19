import { describe, expect, it } from "bun:test";

import ReconciliationFixture from "./reconciliation-dependencies-test-fixture";
import { openRunEventStore } from "./run-events";
import { reconcileInterruptedRuns } from "./run-reconciliation";

const reconcileInterruptedRunsReconcilesARunToINTERRUPTEDWhenItsClaimedTargetsPidIsDeadAndNoTerminal =
	async (): Promise<void> => {
		const store = await openRunEventStore(":memory:");
		store.append({
			elapsedMs: 0,
			kind: "stage-started",
			runId: "run-1",
			spentUsd: 0,
			stage: "shape",
		});
		const dependencies = new ReconciliationFixture("/runs", {
			alivePids: new Set(),
			manifests: new Map([
				["/runs/run-1.checkpoints/manifest.json", { sourceRoot: "/target" }],
			]),
			markers: new Map([["/target", { pid: 4242 }]]),
		}).build();

		const reconciled = await reconcileInterruptedRuns(store, dependencies);

		expect(reconciled).toEqual(["run-1"]);
		expect(store.latestEvent("run-1")?.kind).toBe("run-interrupted");
		store.close();
	};

const reconcileInterruptedRunsCarriesTheRunSpendAndTokensOfTheRunsLastEventOntoItsInterruption =
	async (): Promise<void> => {
		const store = await openRunEventStore(":memory:");
		store.append({
			elapsedMs: 10,
			kind: "turn-completed",
			runId: "run-1",
			runSpentUsd: 2.5,
			runTokens: { input: 300, output: 40 },
			spentUsd: 1,
			stage: "build",
		});
		const dependencies = new ReconciliationFixture("/runs", {
			manifests: new Map([
				["/runs/run-1.checkpoints/manifest.json", { sourceRoot: "/target" }],
			]),
			markers: new Map([["/target", { pid: 4242 }]]),
		}).build();

		await reconcileInterruptedRuns(store, dependencies);

		expect(store.latestEvent("run-1")).toMatchObject({
			runSpentUsd: 2.5,
			runTokens: { input: 300, output: 40 },
		});
		store.close();
	};

const reconcileInterruptedRunsLeavesARunAloneWhenItsClaimedTargetsPidIsStillAlive =
	async (): Promise<void> => {
		const liveRunOwnerPid = 4242;

		const store = await openRunEventStore(":memory:");
		store.append({
			elapsedMs: 0,
			kind: "stage-started",
			runId: "run-1",
			spentUsd: 0,
			stage: "shape",
		});
		const dependencies = new ReconciliationFixture("/runs", {
			alivePids: new Set([liveRunOwnerPid]),
			manifests: new Map([
				["/runs/run-1.checkpoints/manifest.json", { sourceRoot: "/target" }],
			]),
			markers: new Map([["/target", { pid: 4242 }]]),
		}).build();

		const reconciled = await reconcileInterruptedRuns(store, dependencies);

		expect(reconciled).toEqual([]);
		expect(store.latestEvent("run-1")?.kind).toBe("stage-started");
		store.close();
	};

const reconcileInterruptedRunsLeavesARunAloneOnceItsTerminalRecordAlreadyExistsOnDisk =
	async (): Promise<void> => {
		const store = await openRunEventStore(":memory:");
		store.append({
			elapsedMs: 0,
			kind: "stage-started",
			runId: "run-1",
			spentUsd: 0,
			stage: "shape",
		});
		const dependencies = new ReconciliationFixture("/runs", {
			artifactFiles: new Set(["/runs/run-1.json"]),
		}).build();

		const reconciled = await reconcileInterruptedRuns(store, dependencies);

		expect(reconciled).toEqual([]);
		expect(store.latestEvent("run-1")?.kind).toBe("stage-started");
		store.close();
	};

const reconcileInterruptedRunsTreatsAMissingManifestAsNothingToReconcileNotAnErrorSinceTheCrashMay =
	async (): Promise<void> => {
		const store = await openRunEventStore(":memory:");
		store.append({
			elapsedMs: 0,
			kind: "stage-started",
			runId: "run-1",
			spentUsd: 0,
			stage: "shape",
		});
		const dependencies = new ReconciliationFixture("/runs").build();

		const reconciled = await reconcileInterruptedRuns(store, dependencies);

		expect(reconciled).toEqual([]);
		expect(store.latestEvent("run-1")?.kind).toBe("stage-started");
		store.close();
	};

const reconcileInterruptedRunsTreatsAMissingClaimMarkerAsNothingToReconcileSinceTheRunsEndMayAlready =
	async (): Promise<void> => {
		const store = await openRunEventStore(":memory:");
		store.append({
			elapsedMs: 0,
			kind: "stage-started",
			runId: "run-1",
			spentUsd: 0,
			stage: "shape",
		});
		const dependencies = new ReconciliationFixture("/runs", {
			manifests: new Map([
				["/runs/run-1.checkpoints/manifest.json", { sourceRoot: "/target" }],
			]),
		}).build();

		const reconciled = await reconcileInterruptedRuns(store, dependencies);

		expect(reconciled).toEqual([]);
		expect(store.latestEvent("run-1")?.kind).toBe("stage-started");
		store.close();
	};

const reconcileInterruptedRunsDoesNotRereconcileARunAlreadyMarkedINTERRUPTED =
	async (): Promise<void> => {
		const store = await openRunEventStore(":memory:");
		store.append({
			elapsedMs: 0,
			kind: "run-interrupted",
			runId: "run-1",
			spentUsd: 0,
			stage: "shape",
		});
		const dependencies = new ReconciliationFixture("/runs", {
			manifests: new Map([
				["/runs/run-1.checkpoints/manifest.json", { sourceRoot: "/target" }],
			]),
			markers: new Map([["/target", { pid: 4242 }]]),
		}).build();

		const reconciled = await reconcileInterruptedRuns(store, dependencies);

		expect(reconciled).toEqual([]);
		store.close();
	};

describe(reconcileInterruptedRuns.name, () => {
	it(
		"reconciles a run to INTERRUPTED when its claimed target's pid is dead and no terminal record exists",
		reconcileInterruptedRunsReconcilesARunToINTERRUPTEDWhenItsClaimedTargetsPidIsDeadAndNoTerminal,
	);
	it(
		"carries the run spend and tokens of the run's last event onto its interruption",
		reconcileInterruptedRunsCarriesTheRunSpendAndTokensOfTheRunsLastEventOntoItsInterruption,
	);
	it(
		"leaves a run alone when its claimed target's pid is still alive",
		reconcileInterruptedRunsLeavesARunAloneWhenItsClaimedTargetsPidIsStillAlive,
	);
	it(
		"leaves a run alone once its terminal record already exists on disk",
		reconcileInterruptedRunsLeavesARunAloneOnceItsTerminalRecordAlreadyExistsOnDisk,
	);
	it(
		"treats a missing manifest as nothing to reconcile, not an error, since the crash may have preceded it",
		reconcileInterruptedRunsTreatsAMissingManifestAsNothingToReconcileNotAnErrorSinceTheCrashMay,
	);
	it(
		"treats a missing claim marker as nothing to reconcile, since the run's end may already have removed its checkout",
		reconcileInterruptedRunsTreatsAMissingClaimMarkerAsNothingToReconcileSinceTheRunsEndMayAlready,
	);
	it(
		"does not re-reconcile a run already marked INTERRUPTED",
		reconcileInterruptedRunsDoesNotRereconcileARunAlreadyMarkedINTERRUPTED,
	);
});
