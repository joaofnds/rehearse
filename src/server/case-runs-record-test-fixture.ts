import { z } from "zod";

import { PASS } from "#benchmark/comparison-test-fixtures";
import {
	confirmationGroupRecordSchema,
	parseConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import type { ParsedConfirmationRepRecord } from "#benchmark/confirmation-record";
import type { Immutable } from "#benchmark/contracts";
import {
	benchmarkRunPaths,
	confirmationGroupPaths,
} from "#benchmark/run-layout";
import { parseSessionAttemptRecord } from "#benchmark/session-record";
import { fixture, root } from "#server/case-runs-test-fixture";
import { SHA256_HEX_DIGITS } from "#server/digest-test-support";

import type { CaseRun } from "./case-figures";

const SINGLE_SESSION_REP_COUNT = 1;

async function mergeJson(
	file: string,
	changes: Immutable<{ corpusVersion?: unknown; startedAt?: string }>,
): Promise<void> {
	const record = z
		.object({})
		.loose()
		.parse(JSON.parse(await Bun.file(file).text()));
	await Bun.write(file, JSON.stringify({ ...record, ...changes }));
}

async function rewriteRep(
	file: string,
	changes: Immutable<Partial<ParsedConfirmationRepRecord>>,
): Promise<void> {
	const record = parseConfirmationRepRecord(await Bun.file(file).text());
	await Bun.write(file, JSON.stringify({ ...record, ...changes }));
}

async function sessionGroupWithAttemptChanges(
	groupId: string,
	changes: Readonly<Record<string, boolean>>,
): Promise<void> {
	const [repId] = await fixture.confirmations.records.writeSessionGroup(
		groupId,
		SINGLE_SESSION_REP_COUNT,
	);
	const file = confirmationGroupPaths(root, groupId).rep(repId).attemptFile;
	const record = parseSessionAttemptRecord(await Bun.file(file).text());
	await Bun.write(file, JSON.stringify({ ...record, ...changes }));
}

async function recordVersionedPipelineRun(
	run: string,
	digest: string,
): Promise<void> {
	await fixture.pipeline.writeFinishedRunEvidence(run);
	await mergeJson(benchmarkRunPaths(root, run).manifestFile, {
		corpusVersion: { digest, kind: "version" },
	});
}

async function recordVersionedPipelineGroup(
	groupId: string,
	digest: string,
	startedAt?: string,
): Promise<void> {
	await fixture.confirmations.records.writePipelineGroup(groupId, [PASS, PASS]);
	const { groupFile } = confirmationGroupPaths(root, groupId);
	const group = confirmationGroupRecordSchema.parse(
		JSON.parse(await Bun.file(groupFile).text()),
	);
	const record = {
		...group,
		inputs: { ...group.inputs, corpusVersion: { digest, kind: "version" } },
	};
	await Bun.write(
		groupFile,
		JSON.stringify(startedAt === undefined ? record : { ...record, startedAt }),
	);
}

const digest = "d".repeat(SHA256_HEX_DIGITS);

const attemptRun = {
	corpusDigest: digest,
	costUsd: 0.5,
	passed: true,
	recordedOutcome: "SUCCESSFUL",
	replyChecks: { passed: 1, total: 1 },
	savedState: {
		reason: "No saved state assessment was recorded; declaration is unknown.",
		state: "unavailable",
	},
} satisfies CaseRun;

const missingRun = {
	corpusDigest: undefined,
	costUsd: undefined,
	passed: undefined,
};

const firstGroupRun = {
	...attemptRun,
	corpusDigest: undefined,
	costUsd: undefined,
	passed: undefined,
};

export {
	digest,
	attemptRun,
	missingRun,
	firstGroupRun,
	mergeJson,
	rewriteRep,
	sessionGroupWithAttemptChanges,
	recordVersionedPipelineRun,
	recordVersionedPipelineGroup,
};
