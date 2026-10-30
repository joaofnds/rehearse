import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import writeComparisonReport from "./comparison-command";
import comparisonLoaderTestFixture from "./comparison-loader-test-fixture";
import { updateAttempts } from "./session-comparison-attempt-record-fixture";
import { writeManifest } from "./session-comparison-group-test-fixture";
import { sessionGroupFile } from "./session-comparison-record-test-fixture";
import { comparisonSuiteRoot } from "./session-comparison-workspace-fixture";
import {
	addStageLiveReads,
	failStagesWithLiveReads,
} from "./stage-live-read-test-fixture";

const root = comparisonSuiteRoot();

const FIRST_REP_ORDINAL = 1;

async function namesTheArmWhoseSessionsReadAFileUnderTestThroughTheLiveInstall(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });
	const notices: string[] = [];
	await updateAttempts(
		sessionGroupFile({ caseId: "case-one", role: "candidate", runsDirectory }),
		(attempt) => ({
			...attempt,
			corpusDelivery: {
				liveReads: [{ count: 2, path: "rulebook/ownership.md" }],
				redirected: 1,
				rule: 1,
			},
		}),
	);

	await writeComparisonReport({
		manifestPath,
		notice: (line) => {
			notices.push(line);
		},
		runsDirectory,
	});

	expect(notices).toEqual([
		"case case-one arm candidate read files under test through the live install, so it measured the live copy of: rulebook/ownership.md (4 calls)",
	]);
}

async function namesNoArmWhenEverySessionReadItsOwnCopy(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });
	const notices: string[] = [];

	await writeComparisonReport({
		manifestPath,
		notice: (line) => {
			notices.push(line);
		},
		runsDirectory,
	});

	expect(notices).toEqual([]);
}

describe("a stage comparison", () => {
	const { fixture, temporaryDirectory } = comparisonLoaderTestFixture();

	it.each([
		{ outcome: "judged", rewrite: addStageLiveReads },
		{ outcome: "failed", rewrite: failStagesWithLiveReads },
	])(
		"names the arm whose $outcome stage read a file under test through the live install",
		async ({ rewrite }) => {
			await rewrite(fixture.repFile("case-1", "control", FIRST_REP_ORDINAL), [
				{ count: 3, path: "skills/build/SKILL.md" },
			]);
			const notices: string[] = [];

			await writeComparisonReport({
				manifestPath: fixture.manifestFile,
				notice: (line) => {
					notices.push(line);
				},
				runsDirectory: join(temporaryDirectory, "runs"),
			});

			expect(notices).toEqual([
				"case case-1 arm control read files under test through the live install, so it measured the live copy of: skills/build/SKILL.md (3 calls)",
			]);
		},
	);
});

describe(writeComparisonReport.name, () => {
	it(
		"names the arm whose sessions read a file under test through the live install",
		namesTheArmWhoseSessionsReadAFileUnderTestThroughTheLiveInstall,
	);

	it(
		"names no arm when every session read its own copy",
		namesNoArmWhenEverySessionReadItsOwnCopy,
	);
});
