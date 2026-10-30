import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import writeComparisonReport from "./comparison-command";
import { updateAttempts } from "./session-comparison-attempt-record-fixture";
import {
	addFrozenCorpusFile,
	removeFrozenCorpusFile,
	updateCandidateCorpus,
} from "./session-comparison-corpus-test-fixture";
import { writeManifest } from "./session-comparison-group-test-fixture";
import {
	digest,
	sessionGroupFile,
	updateFrozenCase,
} from "./session-comparison-record-test-fixture";
import { PROBE_NOTES, PROBE_SKILL } from "./session-comparison-test-contract";
import { comparisonSuiteRoot } from "./session-comparison-workspace-fixture";

const root = comparisonSuiteRoot();

async function testRefusesAFrozenCorpusFileAnIsolatedCaseDoesNotDeclare(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });
	const groupFile = sessionGroupFile({
		caseId: "case-one",
		role: "candidate",
		runsDirectory,
	});

	await updateFrozenCase(groupFile, (declaration) => ({
		...declaration,
		isolated: true,
	}));
	await addFrozenCorpusFile({
		groupFile,
		path: `inputs/corpus/${PROBE_SKILL}`,
	});

	const comparison = writeComparisonReport({ manifestPath, runsDirectory });

	expect(comparison).rejects.toThrow(
		"case case-one arm candidate field inputs.files.corpus",
	);
}

/**
 * A case run with the actual setup freezes the whole corpus, so its group
 * holds instruction files the case never declared.
 */
async function testAcceptsAFrozenCorpusFileACaseRunWithTheActualSetupDoesNotDeclare(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	await Array.fromAsync(["case-one", "case-two"], async (caseId) => {
		await addFrozenCorpusFile({
			groupFile: sessionGroupFile({ caseId, role: "candidate", runsDirectory }),
			path: `inputs/corpus/${PROBE_SKILL}`,
		});
	});

	const comparison = writeComparisonReport({ manifestPath, runsDirectory });

	expect(comparison).resolves.toEndWith("report.json");
}

async function testRefusesAGroupMissingADeclaredCorpusFile(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	await removeFrozenCorpusFile({
		groupFile: sessionGroupFile({
			caseId: "case-one",
			role: "candidate",
			runsDirectory,
		}),
		path: "inputs/corpus/output-styles/brief.md",
	});

	const comparison = writeComparisonReport({ manifestPath, runsDirectory });

	expect(comparison).rejects.toThrow(
		"case case-one arm candidate field inputs.files.corpus",
	);
}

async function testRefusesAFrozenCorpusPathRecordedTwiceInTwoSpellings(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest(
		{ root, runsDirectory },
		{ caseIds: ["case-skill"], selectVariant: undefined },
	);

	await addFrozenCorpusFile({
		groupFile: sessionGroupFile({
			caseId: "case-skill",
			role: "candidate",
			runsDirectory,
		}),
		path: `inputs\\corpus\\${PROBE_NOTES.replaceAll("/", "\\")}`,
	});

	const comparison = writeComparisonReport({ manifestPath, runsDirectory });

	expect(comparison).rejects.toThrow(
		"case case-skill arm candidate field inputs.files.corpus",
	);
}

async function testRefusesAnAttemptWhoseCorpusDigestDisagreesWithTheFrozenFile(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	await updateAttempts(
		sessionGroupFile({
			caseId: "case-one",
			role: "candidate",
			runsDirectory,
		}),
		(attempt) => ({
			...attempt,
			corpusFiles: attempt.corpusFiles.map((file) => ({
				...file,
				sha256: digest("other bytes\n"),
			})),
		}),
	);

	const comparison = writeComparisonReport({ manifestPath, runsDirectory });

	expect(comparison).rejects.toThrow(
		"attempt corpus files disagree with the frozen session inputs",
	);
}

async function testRefusesSameRoleCorpusDriftAcrossCases(): Promise<void> {
	const runsDirectory = join(root, "runs");
	const manifestPath = await writeManifest({ root, runsDirectory });

	await updateCandidateCorpus({
		caseId: "case-two",
		content: "candidate corpus changed\n",
		runsDirectory,
	});

	expect(
		writeComparisonReport({ manifestPath, runsDirectory }),
	).rejects.toThrow(
		"case case-two arm candidate field inputs.files.corpus differs from case case-one",
	);
}

describe("session comparison corpus inputs", () => {
	it(
		"refuses a frozen corpus file an isolated case does not declare",
		testRefusesAFrozenCorpusFileAnIsolatedCaseDoesNotDeclare,
	);

	it(
		"accepts a frozen corpus file a case run with the actual setup does not declare",
		testAcceptsAFrozenCorpusFileACaseRunWithTheActualSetupDoesNotDeclare,
	);

	it(
		"refuses a group missing a declared corpus file",
		testRefusesAGroupMissingADeclaredCorpusFile,
	);

	it(
		"refuses a frozen corpus path recorded twice in two spellings",
		testRefusesAFrozenCorpusPathRecordedTwiceInTwoSpellings,
	);

	it(
		"refuses an attempt whose corpus digest disagrees with the frozen file",
		testRefusesAnAttemptWhoseCorpusDigestDisagreesWithTheFrozenFile,
	);

	it(
		"refuses same-role corpus drift across cases",
		testRefusesSameRoleCorpusDriftAcrossCases,
	);
});
