import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import {
	confirmationGroupPaths,
	runNameFromTimestamp,
} from "#benchmark/run-layout";
import {
	parseConfirmationGroupRecord,
	parseConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import { replayRecordSchema } from "#benchmark/replay-record";
import { parseSessionAttemptRecord } from "#benchmark/session-record";
import { createApiApp } from "./api";
import {
	RecordedRunsFixture,
	directorySource,
	fixedCorpusSource,
	nothingRunning,
	NO_PROVIDER_PROJECTS,
} from "#benchmark/run-records-test-support";
import { readAttemptEvidence, readGroupAttemptIndex } from "./attempt-evidence";
import { expectHistoryError } from "./evidence-test-support";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});
async function fixture(recordsName?: string): Promise<RecordedRunsFixture> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-attempt-evidence-"));
	roots.push(root);
	const recordsDirectory =
		recordsName === undefined ? root : join(root, recordsName);
	await mkdir(recordsDirectory, { recursive: true });
	const saved = new RecordedRunsFixture(recordsDirectory);
	await saved.write();
	return saved;
}
function sessionId(saved: RecordedRunsFixture): string {
	return `attempt:session:${saved.sessionAttempt.caseId}/${saved.sessionAttempt.uuid}`;
}
function replayId(saved: RecordedRunsFixture): string {
	return `attempt:stage:${saved.stageAttempt.lineage}/${saved.stageAttempt.timestamp}`;
}
describe(readAttemptEvidence.name, () => {
	it("reads group identities when the records directory is named confirmations", async () => {
		const saved = await fixture("confirmations");

		const index = await readGroupAttemptIndex({
			runsDirectory: saved.runsDirectory,
			groupId: saved.groupId,
		});

		expect(index.groupId).toBe(saved.groupId);
	});

	it("reads an ISO timestamp saved under the replay producer's filename", async () => {
		const saved = await fixture();
		const replay = replayRecordSchema.parse(
			JSON.parse(await Bun.file(saved.stageAttemptFile).text()),
		);
		const timestamp = "2026-10-01T12:34:56.789Z";
		const fileTimestamp = runNameFromTimestamp(timestamp);
		await Bun.write(
			join(dirname(saved.stageAttemptFile), `${fileTimestamp}.json`),
			JSON.stringify({ ...replay, timestamp }),
		);

		const result = await readAttemptEvidence({
			runsDirectory: saved.runsDirectory,
			id: `attempt:stage:${replay.consumed.lineage}/${fileTimestamp}`,
		});

		expect(result).toMatchObject({
			state: "available",
			kind: "stage",
			stage: replay.stage,
		});
	});

	it("projects the exact saved session reply and deterministic outcomes", async () => {
		const saved = await fixture();
		const record = parseSessionAttemptRecord(
			await Bun.file(saved.sessionAttemptFile).text(),
		);

		const result = await readAttemptEvidence({
			runsDirectory: saved.runsDirectory,
			id: sessionId(saved),
		});

		expect(result).toEqual({
			state: "available",
			kind: "session",
			record: {
				caseId: record.caseId,
				outcome: record.outcome,
				reply: record.reply,
				error: undefined,
				checks: record.checks,
				stateResults: undefined,
				stateGradingError: undefined,
			},
		});
	});

	it("refuses a saved session whose case identity differs", async () => {
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
				runsDirectory: saved.runsDirectory,
				id: sessionId(saved),
			}),
			"refused",
		);
	});
	for (const field of ["lineage", "timestamp"] as const) {
		it(`refuses a saved replay with a different ${field}`, async () => {
			const saved = await fixture();
			const replay = replayRecordSchema.parse(
				JSON.parse(await Bun.file(saved.stageAttemptFile).text()),
			);
			await Bun.write(
				saved.stageAttemptFile,
				JSON.stringify(
					field === "lineage"
						? {
								...replay,
								consumed: { ...replay.consumed, lineage: "different" },
							}
						: { ...replay, timestamp: "different" },
				),
			);
			await expectHistoryError(
				readAttemptEvidence({
					runsDirectory: saved.runsDirectory,
					id: replayId(saved),
				}),
				"refused",
			);
		});
	}
	it("refuses a replay scorecard for another stage", async () => {
		const saved = await fixture();
		const replay = replayRecordSchema.parse(
			JSON.parse(await Bun.file(saved.stageAttemptFile).text()),
		);
		await Bun.write(
			saved.stageAttemptFile,
			JSON.stringify({
				...replay,
				scorecard: { ...replay.scorecard, stage: "another-stage" },
			}),
		);
		await expectHistoryError(
			readAttemptEvidence({
				runsDirectory: saved.runsDirectory,
				id: replayId(saved),
			}),
			"refused",
		);
	});
	it("retains summary-only replay grades without inventing detailed findings", async () => {
		const saved = await fixture();
		const result = await readAttemptEvidence({
			runsDirectory: saved.runsDirectory,
			id: replayId(saved),
		});
		expect(result).toMatchObject({
			state: "available",
			kind: "stage",
			assessment: { grade: "A", detailed: false, requirements: [] },
		});
	});
	it("projects saved replay output and citations while preserving the distinction between consumed and resulting lineage", async () => {
		const saved = await fixture();
		const replay = replayRecordSchema.parse(
			JSON.parse(await Bun.file(saved.stageAttemptFile).text()),
		);
		await Bun.write(
			saved.stageAttemptFile,
			JSON.stringify({
				...replay,
				scorecard: {
					...replay.scorecard,
					input: {
						artifact: {
							path: "delivery.md",
							content: "The actual retained output",
						},
						diff: "The saved delivery diff",
						transcript: {
							stage: "build",
							sessionId: "saved",
							costUsd: 0,
							providerCalls: [],
							exchanges: [
								{ agent: { status: "COMPLETE", message: "Completed reply" } },
								{ agent: { status: "QUESTION", message: "A later question" } },
							],
						},
					},
					grade: {
						grade: "C",
						verdict: "STOP",
						summary: "The response omitted hasMore.",
						hardBlockers: [],
						requirements: [
							{
								id: "response",
								status: "FAIL",
								evidence: [
									{
										source: "artifact",
										path: "delivery.md",
										claim: "The public field is absent",
										quote: "retained output",
										locator: {
											kind: "lines",
											file: "delivery.md",
											startLine: 1,
											endLine: 1,
											occurrences: 1,
										},
									},
								],
							},
						],
						dimensions: [],
					},
				},
			}),
		);
		expect(replay.lineage).not.toBe(replay.consumed.lineage);
		const result = await readAttemptEvidence({
			runsDirectory: saved.runsDirectory,
			id: replayId(saved),
		});
		expect(result).toMatchObject({
			state: "available",
			kind: "stage",
			stage: "build",
			output: {
				state: "available",
				kind: "artifact",
				path: "delivery.md",
				text: "The actual retained output",
			},
			diff: "The saved delivery diff",
			completionReply: "Completed reply",
			assessment: {
				grade: "C",
				summary: "The response omitted hasMore.",
				detailed: true,
				requirements: [
					{
						id: "response",
						status: "FAIL",
						evidence: [
							{
								claim: "The public field is absent",
								quote: "retained output",
								place: "delivery.md:1",
							},
						],
					},
				],
			},
		});
	});
	it("serves a typed read-only attempt projection without raw record bookkeeping", async () => {
		const saved = await fixture();
		const app = createApiApp({
			runsDirectory: saved.runsDirectory,
			projectsDirectory: NO_PROVIDER_PROJECTS,
			liveness: nothingRunning,
			readCorpusSource: fixedCorpusSource(directorySource(saved.runsDirectory)),
		});
		const response = await app.request(
			`/api/attempt-evidence/${encodeURIComponent(sessionId(saved))}`,
		);
		expect(response.status).toBe(200);
		const text = await response.text();
		expect(text).toContain('"reply":"the reply"');
		expect(text).not.toContain('"transcriptDiagnostics"');
		expect(text).not.toContain('"corpusFiles"');
		expect(text).not.toContain('"prompt"');
	});
	it("projects the group's saved repetition identities for navigation", async () => {
		const saved = await fixture();
		const index = await readGroupAttemptIndex({
			runsDirectory: saved.runsDirectory,
			groupId: saved.groupId,
		});
		expect(index.groupId).toBe(saved.groupId);
		expect(index.caseId).toBe("audit-log");
		expect(index.repRecords).toEqual([
			{ repId: "group-1-rep-1", ordinal: 1 },
			{ repId: "group-1-rep-2", ordinal: 2 },
		]);
	});

	it.each(["groupId", "ordinal", "caseId", "mode"] as const)(
		"refuses isolated %s mismatches in repetition metadata",
		async (field) => {
			const saved = await fixture();
			const groupId = "stage-group";
			await saved.writeStageGroupWithReps(groupId);
			const repId = `${groupId}-rep-1`;
			const paths = confirmationGroupPaths(saved.runsDirectory, groupId).rep(
				repId,
			);
			const rep = parseConfirmationRepRecord(
				await Bun.file(paths.recordFile).text(),
			);
			const changes = {
				groupId: { groupId: "other-group" },
				ordinal: { ordinal: 2 },
				caseId: { caseId: "other-case" },
				mode: { mode: "pipeline" },
			};
			await Bun.write(
				paths.recordFile,
				JSON.stringify({ ...rep, ...changes[field] }),
			);
			await Bun.write(
				paths.stageFile("build"),
				JSON.stringify({
					stage: "build",
					grade: { grade: "A", verdict: "CONTINUE" },
				}),
			);

			await expectHistoryError(
				readAttemptEvidence({
					runsDirectory: saved.runsDirectory,
					id: `rep:stage:${groupId}/${repId}/build`,
				}),
				"refused",
			);
		},
	);

	it("refuses a session repetition not owned by its group reference", async () => {
		const saved = await fixture();
		const groupId = "session-group";
		const reps = await saved.writeSessionGroup(groupId);
		const [repId] = reps;
		if (repId === undefined) {
			throw new Error("Missing test repetition");
		}
		const paths = confirmationGroupPaths(saved.runsDirectory, groupId);
		const group = parseConfirmationGroupRecord(
			await Bun.file(paths.groupFile).text(),
		);
		await Bun.write(
			paths.groupFile,
			JSON.stringify({
				...group,
				repRecords: group.repRecords.map((rep) => ({
					repId: rep.repId,
					ordinal: rep.ordinal,
					path: rep.repId === repId ? "wrong-rep.json" : rep.path,
				})),
			}),
		);
		await expectHistoryError(
			readAttemptEvidence({
				runsDirectory: saved.runsDirectory,
				id: `rep:session:${groupId}/${repId}`,
			}),
			"refused",
		);
	});
	it("projects an owned session repetition and an owned judged workflow step", async () => {
		const saved = await fixture();
		const sessionGroup = "owned-session";
		const [sessionRep] = await saved.writeSessionGroup(sessionGroup);
		if (sessionRep === undefined) {
			throw new Error("Missing session test repetition");
		}
		expect(
			await readAttemptEvidence({
				runsDirectory: saved.runsDirectory,
				id: `rep:session:${sessionGroup}/${sessionRep}`,
			}),
		).toMatchObject({ state: "available", kind: "session" });
		const stageGroup = "owned-stage";
		await saved.writeStageGroupWithReps(stageGroup);
		const repId = `${stageGroup}-rep-1`;
		const paths = confirmationGroupPaths(saved.runsDirectory, stageGroup).rep(
			repId,
		);
		const rep = parseConfirmationRepRecord(
			await Bun.file(paths.recordFile).text(),
		);
		const outcome = rep.stages.find((stage) => stage.stage === "build");
		if (outcome?.status !== "JUDGED") {
			throw new Error("Missing judged test step");
		}
		await Bun.write(
			paths.stageFile("build"),
			JSON.stringify({
				stage: "build",
				input: { artifact: { path: "delivery.md", content: "Owned delivery" } },
				grade: { grade: outcome.grade, verdict: outcome.verdict },
			}),
		);
		expect(
			await readAttemptEvidence({
				runsDirectory: saved.runsDirectory,
				id: `rep:stage:${stageGroup}/${repId}/build`,
			}),
		).toMatchObject({
			state: "available",
			kind: "stage",
			output: { state: "available", text: "Owned delivery" },
		});
	});
	it("reports malformed saved attempt JSON as unavailable", async () => {
		const saved = await fixture();
		await Bun.write(saved.sessionAttemptFile, "{broken");

		const result = await readAttemptEvidence({
			runsDirectory: saved.runsDirectory,
			id: sessionId(saved),
		});

		expect(result).toEqual({
			state: "unavailable",
			reason:
				"The saved attempt or replay retains no readable detailed output and assessment.",
		});
	});
	it("does not confuse an identifier matching the records directory name with a path marker", async () => {
		const saved = await fixture("smoke");

		const result = await readAttemptEvidence({
			runsDirectory: saved.runsDirectory,
			id: sessionId(saved),
		});

		expect(result).toMatchObject({
			state: "available",
			kind: "session",
			record: { caseId: "smoke" },
		});
	});
	it("does not strip a group identity matching the records directory name", async () => {
		const saved = await fixture("group-1");

		const result = await readGroupAttemptIndex({
			runsDirectory: saved.runsDirectory,
			groupId: saved.groupId,
		});

		expect(result.groupId).toBe("group-1");
	});
	it("reads owned repetition evidence when the records directory is named confirmations", async () => {
		const saved = await fixture("confirmations");
		const groupId = "named-root-session";
		const [repId] = await saved.writeSessionGroup(groupId);
		if (repId === undefined) {
			throw new Error("Missing repetition fixture");
		}

		const result = await readAttemptEvidence({
			runsDirectory: saved.runsDirectory,
			id: `rep:session:${groupId}/${repId}`,
		});

		expect(result).toMatchObject({ state: "available", kind: "session" });
	});
	it("does not strip a repetition identity matching the records directory name", async () => {
		const saved = await fixture("session-root-rep-1");
		const groupId = "session-root";
		await saved.writeSessionGroup(groupId);

		const result = await readAttemptEvidence({
			runsDirectory: saved.runsDirectory,
			id: `rep:session:${groupId}/session-root-rep-1`,
		});

		expect(result).toMatchObject({ state: "available", kind: "session" });
	});
	it("identifies malformed group metadata without blaming the saved attempt", async () => {
		const saved = await fixture();
		const groupId = "malformed-group";
		const [repId] = await saved.writeSessionGroup(groupId);
		if (repId === undefined) {
			throw new Error("Missing repetition fixture");
		}
		await Bun.write(
			confirmationGroupPaths(saved.runsDirectory, groupId).groupFile,
			"{broken",
		);
		const app = createApiApp({
			runsDirectory: saved.runsDirectory,
			projectsDirectory: NO_PROVIDER_PROJECTS,
			liveness: nothingRunning,
			readCorpusSource: fixedCorpusSource(directorySource(saved.runsDirectory)),
		});

		const response = await app.request(
			`/api/attempt-evidence/${encodeURIComponent(`rep:session:${groupId}/${repId}`)}`,
		);

		expect(response.status).toBe(400);
		expect(await response.text()).toContain(
			"The saved group metadata could not be read.",
		);
	});
});
