import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { writeRunManifest } from "./manifest";
import ReconciliationManifestBuilder from "./reconciliation-manifest-test-builder";
import ReconciliationWorkspace from "./reconciliation-workspace-test-fixture";
import { openRunEventStore } from "./run-events";
import { benchmarkRunPaths } from "./run-layout";
import {
	liveReconciliationDependencies,
	reconcileInterruptedRuns,
} from "./run-reconciliation";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();
const workspace = new ReconciliationWorkspace(testResources);

const liveReconciliationDependenciesLeavesARunAloneWhenItsClaimedTargetsPidIsThisLiveTestProcess =
	async (): Promise<void> => {
		const runsDirectory = await workspace.claimedRun();
		const store = await openRunEventStore(":memory:");
		store.append({
			elapsedMs: 0,
			kind: "stage-started",
			runId: "run-1",
			spentUsd: 0,
			stage: "shape",
		});

		const reconciled = await reconcileInterruptedRuns(
			store,
			liveReconciliationDependencies(runsDirectory),
		);

		expect(reconciled).toEqual([]);
		expect(store.latestEvent("run-1")?.kind).toBe("stage-started");
		store.close();
	};

const liveReconciliationDependenciesTreatsARunWhoseCheckoutIsGoneAsNothingToReconcileAsAPausedRuns =
	async (): Promise<void> => {
		const runsDirectory = await testResources.createTemporaryDirectory(
			"rehearse-reconciliation-",
		);
		const paths = benchmarkRunPaths(runsDirectory, "run-1");
		await writeRunManifest(
			paths.manifestFile,
			new ReconciliationManifestBuilder({
				sourceRoot: join(runsDirectory, "removed-checkout"),
			}).build(),
		);
		const store = await openRunEventStore(":memory:");
		store.append({
			elapsedMs: 0,
			kind: "stage-started",
			runId: "run-1",
			spentUsd: 0,
			stage: "shape",
		});
		const reports: string[] = [];

		const reconciled = await reconcileInterruptedRuns(store, {
			...liveReconciliationDependencies(runsDirectory),
			reportError: (message) => {
				reports.push(message);
			},
		});

		expect({ reconciled, reports }).toEqual({ reconciled: [], reports: [] });
		store.close();
	};

const liveReconciliationDependenciesTreatsARunWithNoManifestOnDiskAsNothingToReconcile =
	async (): Promise<void> => {
		const runsDirectory = await testResources.createTemporaryDirectory(
			"rehearse-reconciliation-",
		);
		const store = await openRunEventStore(":memory:");
		store.append({
			elapsedMs: 0,
			kind: "stage-started",
			runId: "run-1",
			spentUsd: 0,
			stage: "shape",
		});

		const reconciled = await reconcileInterruptedRuns(
			store,
			liveReconciliationDependencies(runsDirectory),
		);

		expect(reconciled).toEqual([]);
		store.close();
	};

describe(liveReconciliationDependencies.name, () => {
	it(
		"leaves a run alone when its claimed target's pid is this live test process",
		liveReconciliationDependenciesLeavesARunAloneWhenItsClaimedTargetsPidIsThisLiveTestProcess,
	);

	it(
		"treats a run whose checkout is gone as nothing to reconcile, as a paused run's is",
		liveReconciliationDependenciesTreatsARunWhoseCheckoutIsGoneAsNothingToReconcileAsAPausedRuns,
	);

	it(
		"treats a run with no manifest on disk as nothing to reconcile",
		liveReconciliationDependenciesTreatsARunWithNoManifestOnDiskAsNothingToReconcile,
	);
});
