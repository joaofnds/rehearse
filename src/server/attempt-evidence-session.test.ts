import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { parseSessionAttemptRecord } from "#benchmark/session-record";
import {
	clearAttemptEvidenceRoots,
	fixture,
	sessionId,
	startEvidenceApi,
} from "#server/attempt-evidence-test-fixture";

import { readAttemptEvidence } from "./attempt-evidence";
import expectHistoryError from "./evidence-test-support";

afterEach(clearAttemptEvidenceRoots);

async function verifyProjectsTheExactSavedSessionReplyAndDeterministicOutcomes(): Promise<void> {
	const saved = await fixture();
	const record = parseSessionAttemptRecord(
		await Bun.file(saved.sessionAttemptFile).text(),
	);

	const result = await readAttemptEvidence({
		id: sessionId(saved),
		runsDirectory: saved.runsDirectory,
	});

	expect(result).toEqual({
		kind: "session",
		record: {
			caseId: record.caseId,
			checks: record.checks,
			error: undefined,
			judge: undefined,
			outcome: record.outcome,
			reply: record.reply,
			stateGradingError: undefined,
			stateResults: undefined,
		},
		sourceSha256: Bun.CryptoHasher.hash(
			"sha256",
			await Bun.file(saved.sessionAttemptFile).bytes(),
			"hex",
		),
		state: "available",
	});
}

async function verifyRefusesASavedSessionWhoseCaseIdentityDiffers(): Promise<void> {
	const saved = await fixture();
	const record = parseSessionAttemptRecord(
		await Bun.file(saved.sessionAttemptFile).text(),
	);
	await Bun.write(
		saved.sessionAttemptFile,
		JSON.stringify({ ...record, caseId: "other-case" }),
	);

	await expectHistoryError(
		readAttemptEvidence({
			id: sessionId(saved),
			runsDirectory: saved.runsDirectory,
		}),
		"refused",
	);
}

async function verifyServesATypedReadOnlyAttemptProjectionWithoutRawRecordBookkeeping(): Promise<void> {
	const saved = await fixture();
	const api = await startEvidenceApi(saved.runsDirectory);
	const response = await api.savedEvidence.attemptEvidence(sessionId(saved));

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	const text = await response.text();

	expect(text).toContain('"reply":"the reply"');
	expect(text).not.toContain('"transcriptDiagnostics"');
	expect(text).not.toContain('"corpusFiles"');
	expect(text).not.toContain('"prompt"');
}

async function verifyReportsMalformedSavedAttemptJSONAsUnavailable(): Promise<void> {
	const saved = await fixture();
	await Bun.write(saved.sessionAttemptFile, "{broken");

	const result = await readAttemptEvidence({
		id: sessionId(saved),
		runsDirectory: saved.runsDirectory,
	});

	expect(result).toEqual({
		reason:
			"The saved attempt or replay retains no readable detailed output and assessment.",
		state: "unavailable",
	});
}

async function verifyDoesNotConfuseAnIdentifierMatchingTheRecordsDirectoryNameWithAPathMarker(): Promise<void> {
	const saved = await fixture("smoke");

	const result = await readAttemptEvidence({
		id: sessionId(saved),
		runsDirectory: saved.runsDirectory,
	});

	expect(result).toMatchObject({
		kind: "session",
		record: { caseId: "smoke" },
		state: "available",
	});
}

describe(readAttemptEvidence.name, () => {
	describe("when the session record matches its identity", () => {
		it(
			"projects the exact saved session reply and deterministic outcomes",
			verifyProjectsTheExactSavedSessionReplyAndDeterministicOutcomes,
		);

		it(
			"does not confuse an identifier matching the records directory name with a path marker",
			verifyDoesNotConfuseAnIdentifierMatchingTheRecordsDirectoryNameWithAPathMarker,
		);
	});

	describe("when the record names another case", () => {
		it(
			"refuses a saved session whose case identity differs",
			verifyRefusesASavedSessionWhoseCaseIdentityDiffers,
		);
	});

	describe("when the saved record is malformed", () => {
		it(
			"reports malformed saved attempt JSON as unavailable",
			verifyReportsMalformedSavedAttemptJSONAsUnavailable,
		);
	});
});

describe("/api/attempt-evidence/:id", () => {
	describe("GET", () => {
		it(
			"serves a typed read-only attempt projection without raw record bookkeeping",
			verifyServesATypedReadOnlyAttemptProjectionWithoutRawRecordBookkeeping,
		);
	});
});
