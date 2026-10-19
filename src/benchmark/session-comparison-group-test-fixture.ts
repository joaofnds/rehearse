import { join } from "node:path";

import type { ComparisonArm } from "./comparison-record";
import { COMPARISON_ARMS } from "./comparison-record";
import type { Immutable } from "./contracts";
import SessionComparisonAttemptAdapter from "./session-comparison-attempt-adapter-fixture";
import SessionComparisonCaseBuilder from "./session-comparison-case-test-fixture";
import { writeComparisonCorpus } from "./session-comparison-corpus-test-fixture";
import SessionComparisonRequestBuilder from "./session-comparison-request-test-builder";
import type {
	AttemptVariantSelector,
	ComparisonDirectories,
	ComparisonGroupIdentity,
	ManifestCases,
} from "./session-comparison-test-contract";
import { runSessionConfirmation } from "./session-confirmation";
import type { StateCheck } from "./session-state-check";

interface GroupScenario {
	readonly selectVariant?: AttemptVariantSelector | undefined;
	readonly stateCheck?: Immutable<StateCheck> | undefined;
	readonly groupId?: string;
}

async function writeGroup(
	{ root, runsDirectory }: ComparisonDirectories,
	{ caseId, role }: ComparisonGroupIdentity,
	{
		selectVariant,
		stateCheck,
		groupId = `${caseId}-${role}`,
	}: GroupScenario = {},
): Promise<string> {
	const corpus = await writeComparisonCorpus(
		{ root, runsDirectory },
		{ caseId, role },
	);

	const benchmarkCase = new SessionComparisonCaseBuilder({
		caseId,
		role,
		stateCheck,
	}).build();
	const request = new SessionComparisonRequestBuilder({
		corpus,
		groupId,
		runsDirectory,
		sessionCase: benchmarkCase,
	}).build();

	const outcome = await runSessionConfirmation(
		new SessionComparisonAttemptAdapter({
			caseId,
			role,
			selectVariant,
			stateCheck,
		}),
		request,
	);

	return outcome.groupRecordFile;
}

async function writeManifest(
	{ root, runsDirectory }: ComparisonDirectories,
	{
		selectVariant,
		caseIds = ["case-one", "case-two"],
		stateCheck,
	}: ManifestCases = {},
): Promise<string> {
	const cases = await Array.fromAsync(caseIds, async (caseId) => {
		const arms = {
			baseline: "",
			candidate: "",
			control: "",
		} satisfies Record<ComparisonArm, string>;

		await Array.fromAsync(COMPARISON_ARMS, async (role) => {
			arms[role] = await writeGroup(
				{ root, runsDirectory },
				{ caseId, role },
				{
					selectVariant,
					stateCheck,
				},
			);
		});

		return { arms, caseId };
	});
	const manifestPath = join(root, "comparison.json");

	await Bun.write(
		manifestPath,
		`${JSON.stringify({ cases, schemaVersion: 1 })}\n`,
	);

	return manifestPath;
}

export { writeGroup, writeManifest };
