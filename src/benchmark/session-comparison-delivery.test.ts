import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import writeComparisonReport from "./comparison-command";
import { COMPARISON_ARMS } from "./comparison-record-source-schema";
import { updateAttempts } from "./session-comparison-attempt-record-fixture";
import { writeManifest } from "./session-comparison-group-test-fixture";
import { sessionGroupFile } from "./session-comparison-record-test-fixture";
import { comparisonSuiteRoot } from "./session-comparison-workspace-fixture";

const root = comparisonSuiteRoot();

async function refusesAnArmRecordedBeforeDeliveryBesideDeliveredArms(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	await updateAttempts(
		sessionGroupFile({ caseId: "case-one", role: "candidate", runsDirectory }),
		({ corpusDelivery: _delivery, ...attempt }) => attempt,
	);

	expect(
		writeComparisonReport({ manifestPath, runsDirectory }),
	).rejects.toThrow(
		"case case-one arm candidate field corpusDelivery differs from case case-one arm baseline",
	);
}

async function refusesArmsAllRecordedBeforeDelivery(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	await Array.fromAsync(["case-one", "case-two"], async (caseId) => {
		await Array.fromAsync(COMPARISON_ARMS, async (role) => {
			await updateAttempts(
				sessionGroupFile({ caseId, role, runsDirectory }),
				({ corpusDelivery: _delivery, ...attempt }) => attempt,
			);
		});
	});

	expect(
		writeComparisonReport({ manifestPath, runsDirectory }),
	).rejects.toThrow(
		"case case-one arm baseline records no corpus delivery, so its home-path citations read the live install and it cannot be compared until it is run again",
	);
}

async function comparesDeliveredArmsWhateverTheyRedirected(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	await Array.fromAsync(["case-one", "case-two"], async (caseId) => {
		await Array.fromAsync(COMPARISON_ARMS, async (role, index) => {
			await updateAttempts(
				sessionGroupFile({ caseId, role, runsDirectory }),
				(attempt) => ({
					...attempt,
					corpusDelivery: { liveReads: [], redirected: index, rule: 1 },
				}),
			);
		});
	});

	expect(
		writeComparisonReport({ manifestPath, runsDirectory }),
	).resolves.toEndWith("report.json");
}

describe("session comparison corpus delivery", () => {
	it(
		"refuses an arm recorded before delivery beside delivered arms",
		refusesAnArmRecordedBeforeDeliveryBesideDeliveredArms,
	);

	it(
		"refuses arms all recorded before delivery",
		refusesArmsAllRecordedBeforeDelivery,
	);

	it(
		"compares delivered arms whatever they redirected",
		comparesDeliveredArmsWhateverTheyRedirected,
	);
});
