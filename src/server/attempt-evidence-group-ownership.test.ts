import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import {
	parseConfirmationGroupRecord,
	parseConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import {
	clearAttemptEvidenceRoots,
	fixture,
	mustJudgedStep,
	startEvidenceApi,
} from "#server/attempt-evidence-test-fixture";

import { readAttemptEvidence } from "./attempt-evidence";
import expectHistoryError from "./evidence-test-support";

afterEach(clearAttemptEvidenceRoots);

async function verifyRefusesASessionRepetitionNotOwnedByItsGroupReference(): Promise<void> {
	const saved = await fixture();
	const groupId = "session-group";
	const reps = await saved.confirmations.records.writeSessionGroup(groupId);
	const [repId] = reps;

	const paths = confirmationGroupPaths(saved.runsDirectory, groupId);
	const group = parseConfirmationGroupRecord(
		await Bun.file(paths.groupFile).text(),
	);
	await Bun.write(
		paths.groupFile,
		JSON.stringify({
			...group,
			repRecords: group.repRecords.map((rep) => ({
				ordinal: rep.ordinal,
				path: rep.repId === repId ? "wrong-rep.json" : rep.path,
				repId: rep.repId,
			})),
		}),
	);

	await expectHistoryError(
		readAttemptEvidence({
			id: `rep:session:${groupId}/${repId}`,
			runsDirectory: saved.runsDirectory,
		}),
		"refused",
	);
}

async function verifyProjectsAnOwnedSessionRepetition(): Promise<void> {
	const saved = await fixture();
	const sessionGroup = "owned-session";
	const [sessionRep] =
		await saved.confirmations.records.writeSessionGroup(sessionGroup);

	const result = await readAttemptEvidence({
		id: `rep:session:${sessionGroup}/${sessionRep}`,
		runsDirectory: saved.runsDirectory,
	});

	expect(result).toMatchObject({ kind: "session", state: "available" });
}

async function verifyProjectsAnOwnedJudgedWorkflowStep(): Promise<void> {
	const saved = await fixture();
	const stageGroup = "owned-stage";
	await saved.confirmations.records.writeStageGroupWithReps(stageGroup);
	const repId = `${stageGroup}-rep-1`;
	const paths = confirmationGroupPaths(saved.runsDirectory, stageGroup).rep(
		repId,
	);
	const outcome = await mustJudgedStep({
		groupId: stageGroup,
		repId,
		runsDirectory: saved.runsDirectory,
		stage: "build",
	});

	await Bun.write(
		paths.stageFile("build"),
		JSON.stringify({
			grade: { grade: outcome.grade, verdict: outcome.verdict },
			input: { artifact: { content: "Owned delivery", path: "delivery.md" } },
			stage: "build",
		}),
	);

	const result = await readAttemptEvidence({
		id: `rep:stage:${stageGroup}/${repId}/build`,
		runsDirectory: saved.runsDirectory,
	});

	expect(result).toMatchObject({
		kind: "stage",
		output: { state: "available", text: "Owned delivery" },
		state: "available",
	});
}

async function verifyIdentifiesMalformedGroupMetadataWithoutBlamingTheSavedAttempt(): Promise<void> {
	const saved = await fixture();
	const groupId = "malformed-group";
	const [repId] = await saved.confirmations.records.writeSessionGroup(groupId);

	await Bun.write(
		confirmationGroupPaths(saved.runsDirectory, groupId).groupFile,
		"{broken",
	);
	const api = await startEvidenceApi(saved.runsDirectory);

	const response = await api.savedEvidence.attemptEvidence(
		`rep:session:${groupId}/${repId}`,
	);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
	expect(await response.text()).toContain(
		"The saved group metadata could not be read.",
	);
}

describe(readAttemptEvidence.name, () => {
	describe("when the group owns the repetition", () => {
		it(
			"projects an owned session repetition",
			verifyProjectsAnOwnedSessionRepetition,
		);

		it(
			"projects an owned judged workflow step",
			verifyProjectsAnOwnedJudgedWorkflowStep,
		);
	});

	describe("when repetition metadata does not match group ownership", () => {
		it.each(["groupId", "ordinal", "caseId", "mode"] as const)(
			"refuses isolated %s mismatches in repetition metadata",
			verifyMismatchedMetadata,
		);

		it(
			"refuses a session repetition not owned by its group reference",
			verifyRefusesASessionRepetitionNotOwnedByItsGroupReference,
		);
	});
});

describe("/api/attempt-evidence/:id", () => {
	describe("when saved group metadata is malformed", () => {
		it(
			"identifies malformed group metadata without blaming the saved attempt",
			verifyIdentifiesMalformedGroupMetadataWithoutBlamingTheSavedAttempt,
		);
	});
});

async function verifyMismatchedMetadata(
	field: "groupId" | "ordinal" | "caseId" | "mode",
): Promise<void> {
	const saved = await fixture();
	const groupId = "stage-group";
	await saved.confirmations.records.writeStageGroupWithReps(groupId);
	const repId = `${groupId}-rep-1`;
	const paths = confirmationGroupPaths(saved.runsDirectory, groupId).rep(repId);
	const rep = parseConfirmationRepRecord(
		await Bun.file(paths.recordFile).text(),
	);
	const changes = {
		caseId: { caseId: "other-case" },
		groupId: { groupId: "other-group" },
		mode: { mode: "pipeline" },
		ordinal: { ordinal: 2 },
	};
	await Bun.write(
		paths.recordFile,
		JSON.stringify({ ...rep, ...changes[field] }),
	);
	await Bun.write(
		paths.stageFile("build"),
		JSON.stringify({
			grade: { grade: "A", verdict: "CONTINUE" },
			stage: "build",
		}),
	);

	await expectHistoryError(
		readAttemptEvidence({
			id: `rep:stage:${groupId}/${repId}/build`,
			runsDirectory: saved.runsDirectory,
		}),
		"refused",
	);
}
