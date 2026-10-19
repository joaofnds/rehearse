import { describe, expect, it } from "bun:test";

import ReconciliationFixture from "./reconciliation-dependencies-test-fixture";
import { openRunEventStore } from "./run-events";
import type { ReconciliationDependencies } from "./run-reconciliation";
import { reconcileInterruptedRuns } from "./run-reconciliation";

const reconcileInterruptedRunsReconcilesEveryCrashedRunAmongSeveralIndependently =
	async (): Promise<void> => {
		const livePeerOwnerPid = 222;

		const store = await openRunEventStore(":memory:");
		store.append({
			elapsedMs: 0,
			kind: "stage-started",
			runId: "run-1",
			spentUsd: 0,
			stage: "shape",
		});
		store.append({
			elapsedMs: 0,
			kind: "stage-started",
			runId: "run-2",
			spentUsd: 0,
			stage: "discuss",
		});
		const dependencies = new ReconciliationFixture("/runs", {
			alivePids: new Set([livePeerOwnerPid]),
			manifests: new Map([
				["/runs/run-1.checkpoints/manifest.json", { sourceRoot: "/target-1" }],
				["/runs/run-2.checkpoints/manifest.json", { sourceRoot: "/target-2" }],
			]),
			markers: new Map([
				["/target-1", { pid: 111 }],
				["/target-2", { pid: 222 }],
			]),
		}).build();

		const reconciled = await reconcileInterruptedRuns(store, dependencies);

		expect(reconciled.toSorted()).toEqual(["run-1"]);
		store.close();
	};
const reconcileInterruptedRunsReconcilesTheOtherRunsWhenOneRunsManifestIsCorruptRatherThanLettingItCrash =
	async (): Promise<void> => {
		const store = await openRunEventStore(":memory:");
		store.append({
			elapsedMs: 0,
			kind: "stage-started",
			runId: "run-1",
			spentUsd: 0,
			stage: "shape",
		});
		store.append({
			elapsedMs: 0,
			kind: "stage-started",
			runId: "run-2",
			spentUsd: 0,
			stage: "discuss",
		});
		const reports: string[] = [];
		const dependencies: ReconciliationDependencies = {
			...new ReconciliationFixture("/runs", {
				alivePids: new Set(),
				manifests: new Map([
					[
						"/runs/run-2.checkpoints/manifest.json",
						{ sourceRoot: "/target-2" },
					],
				]),
				markers: new Map([["/target-2", { pid: 222 }]]),
				reportError: (message) => {
					reports.push(message);
				},
			}).build(),
			loadManifest: async (path: string) => {
				if (path === "/runs/run-1.checkpoints/manifest.json") {
					throw new Error("malformed manifest.json");
				}

				return await Promise.resolve({ sourceRoot: "/target-2" });
			},
		};

		const reconciled = await reconcileInterruptedRuns(store, dependencies);

		expect(reconciled).toEqual(["run-2"]);
		expect(reports).toEqual([
			"Failed to reconcile run run-1: malformed manifest.json",
		]);
		store.close();
	};
describe("reconciliation among independent runs", () => {
	it(
		"reconciles every crashed run among several, independently",
		reconcileInterruptedRunsReconcilesEveryCrashedRunAmongSeveralIndependently,
	);
	it(
		"reconciles the other runs when one run's manifest is corrupt, rather than letting it crash the whole pass",
		reconcileInterruptedRunsReconcilesTheOtherRunsWhenOneRunsManifestIsCorruptRatherThanLettingItCrash,
	);
});
