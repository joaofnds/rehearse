import { afterEach, describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import type { JsonValue } from "#benchmark/json-value";
import { mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import {
	sessionConfirmationGroupRecordSchema,
	sessionConfirmationRepRecordSchema,
} from "#benchmark/confirmation-record";
import { sessionAttemptRecordSchema } from "#benchmark/session-record";
import { stageCorpusReconciliation } from "#benchmark/session-history";
import {
	directorySource,
	nothingRunning,
	RecordedRunsFixture,
	STOPPED_STAGE_EXCHANGE_TEXT,
	AWAITING_JUDGE_EXCHANGE_TEXT,
	AWAITING_JUDGE_SESSION_ID,
	STOPPED_STAGE_SESSION_ID,
} from "#benchmark/run-records-test-support";
import {
	benchmarkRunPaths,
	confirmationGroupPaths,
	replayRecordFile,
	sessionAttemptPaths,
} from "#benchmark/run-layout";
import { writeRunManifest } from "#benchmark/manifest";
import { TEST_TARGET } from "#benchmark/test-support";
import { createApiApp } from "#server/api";
import {
	readConfirmationAttemptHistory,
	readReplayHistory,
	readStageHistory,
	readConfirmationAttemptRequestSeries,
	readSessionAttemptHistory,
	readSessionAttemptRequestSeries,
	SessionHistoryReaderError,
} from "#server/session-history-reader";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
	);
});

async function writtenAttempt(): Promise<{
	readonly runsDirectory: string;
	readonly caseId: string;
	readonly uuid: string;
}> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-history-reader-"));
	roots.push(root);
	const runsDirectory = join(root, ".benchmark-runs");
	const caseId = "case-a";
	const uuid = "attempt-a";
	const paths = sessionAttemptPaths(runsDirectory, { caseId, uuid });
	await mkdir(paths.directory, { recursive: true });
	const transcript = [
		JSON.stringify({
			type: "assistant",
			cwd: "/work",
			message: {
				content: [
					{
						type: "tool_use",
						id: "read-1",
						name: "Read",
						input: { file_path: "/work/CLAUDE.md" },
					},
				],
			},
		}),
		JSON.stringify({
			type: "user",
			message: {
				content: [
					{
						type: "tool_result",
						tool_use_id: "read-1",
						content: "1\tproject instructions",
					},
				],
			},
		}),
	].join("\n");
	const record = sessionAttemptRecordSchema.parse({
		schemaVersion: 1,
		caseId,
		lineage: "lineage-a",
		model: "sonnet",
		sessionBudgetUsd: 1,
		corpusFiles: [],
		prompt: "inspect",
		reply: "done",
		transcriptFile: "/outside/must-not-be-read.jsonl",
		transcriptDiagnostics: {
			state: "complete",
			prefixLinesExcluded: 0,
			sourceLineCount: 2,
			measuredLineCount: 2,
			toolUseOccurrences: {
				total: 1,
				byName: [{ name: "Read", count: 1 }],
			},
			toolErrors: [],
			repeatedBashCommands: [],
			issues: [],
		},
		outcome: "SUCCESSFUL",
		checks: [{ kind: "word-band", status: "PASS", detail: "1 word" }],
		elapsedMs: 1,
	});
	await Bun.write(paths.recordFile, `${JSON.stringify(record, null, 2)}\n`);
	await Bun.write(join(paths.directory, "transcript.jsonl"), transcript);

	return { runsDirectory, caseId, uuid };
}

async function writtenConfirmationAttempt(): Promise<{
	readonly runsDirectory: string;
	readonly groupId: string;
	readonly repId: string;
	readonly paths: ReturnType<typeof confirmationGroupPaths>;
}> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-confirmation-history-"));
	roots.push(root);
	const runsDirectory = join(root, ".benchmark-runs");
	const groupId = "group-a";
	const repId = "group-a-rep-1";
	const paths = confirmationGroupPaths(runsDirectory, groupId);
	const repPaths = paths.rep(repId);
	await mkdir(repPaths.directory, { recursive: true });
	await Bun.write(
		paths.groupFile,
		`${JSON.stringify(
			sessionConfirmationGroupRecordSchema.parse({
				schemaVersion: 2,
				caseId: "case-a",
				groupId,
				mode: "session",
				reps: 2,
				declaredStages: ["checks"],
				inputs: {
					lineage: { kind: "SESSION", lineage: "lineage-a" },
					files: [
						{
							kind: "case",
							path: "inputs/case.json",
							sha256: "a".repeat(64),
						},
					],
					model: "sonnet",
					sessionBudgetUsd: 1,
				},
				projectedCost: {
					reps: 2,
					perRepMaximumUsd: 1,
					preflightMaximumUsd: 0,
					totalMaximumUsd: 2,
				},
				preflight: { status: "MISSING", missing: "metrics unavailable" },
				approval: { method: "yes", approved: true },
				repRecords: [1, 2].map((ordinal) => ({
					repId: `group-a-rep-${String(ordinal)}`,
					ordinal,
					path: `reps/group-a-rep-${String(ordinal)}/rep.json`,
				})),
				reportFile: "report.json",
				makespanMs: 1,
			}),
		)}\n`,
	);
	await Bun.write(
		repPaths.recordFile,
		`${JSON.stringify(
			sessionConfirmationRepRecordSchema.parse({
				schemaVersion: 2,
				caseId: "case-a",
				groupId,
				repId,
				ordinal: 1,
				mode: "session",
				lineage: { kind: "SESSION", lineage: "lineage-a" },
				outcome: "UNSUCCESSFUL",
				stages: [
					{
						stage: "checks",
						status: "NOT_REACHED",
						reason: "not reached",
						evidence: { recordFile: "attempt.json" },
					},
				],
				finalOutcome: { status: "NOT_APPLICABLE" },
				metrics: { status: "MISSING", calls: [], missing: ["metrics"] },
				workerTrajectorySteps: 0,
				elapsedMs: 1,
			}),
		)}\n`,
	);
	await Bun.write(
		repPaths.attemptFile,
		`${JSON.stringify(
			sessionAttemptRecordSchema.parse({
				schemaVersion: 1,
				caseId: "case-a",
				lineage: "lineage-a",
				model: "sonnet",
				sessionBudgetUsd: 1,
				corpusFiles: [],
				prompt: "inspect",
				reply: "done",
				transcriptFile: "/outside/must-not-be-read.jsonl",
				outcome: "SUCCESSFUL",
				checks: [{ kind: "word-band", status: "PASS", detail: "pass" }],
				elapsedMs: 1,
			}),
		)}\n`,
	);
	await Bun.write(
		repPaths.transcriptFile,
		`${JSON.stringify({ type: "assistant", message: { content: "saved" } })}\n`,
	);

	return { runsDirectory, groupId, repId, paths };
}

describe(readSessionAttemptHistory.name, () => {
	it("reads the verified sibling transcript", async () => {
		const fixture = await writtenAttempt();

		const report = await readSessionAttemptHistory(fixture);

		expect(report.attempt).toMatchObject({
			kind: "session",
			caseId: fixture.caseId,
			id: fixture.uuid,
			model: "sonnet",
			outcome: "SUCCESSFUL",
		});
		expect(
			report.attemptEvents.map(({ id, state }) => ({ id, state })),
		).toEqual([
			{ id: "1:1", state: "invoked" },
			{ id: "2:1", state: "delivered" },
		]);
	});

	it("refuses traversal identities before reading the filesystem", async () => {
		const fixture = await writtenAttempt();

		expect(
			readSessionAttemptHistory({ ...fixture, uuid: "../attempt-a" }),
		).rejects.toBeInstanceOf(SessionHistoryReaderError);
	});

	it("refuses a transcript symlink even when its target is a regular file", async () => {
		const fixture = await writtenAttempt();
		const paths = sessionAttemptPaths(fixture.runsDirectory, fixture);
		const outside = join(fixture.runsDirectory, "outside.jsonl");
		await Bun.write(outside, "secret");
		await rm(paths.transcriptFile);
		await symlink(outside, paths.transcriptFile);

		expect(readSessionAttemptHistory(fixture)).rejects.toBeInstanceOf(
			SessionHistoryReaderError,
		);
	});

	it("refuses a symlink in the saved-attempt directory chain", async () => {
		const fixture = await writtenAttempt();
		const paths = sessionAttemptPaths(fixture.runsDirectory, fixture);
		const outside = join(fixture.runsDirectory, "outside-attempt");
		await mkdir(outside);
		await Bun.write(join(outside, "attempt.json"), "{}");
		await rm(paths.directory, { recursive: true });
		await symlink(outside, paths.directory);

		expect(readSessionAttemptHistory(fixture)).rejects.toBeInstanceOf(
			SessionHistoryReaderError,
		);
	});

	it("keeps a persisted boundary known when the transcript is missing", async () => {
		const fixture = await writtenAttempt();
		const paths = sessionAttemptPaths(fixture.runsDirectory, fixture);
		await rm(paths.transcriptFile);

		const report = await readSessionAttemptHistory(fixture);

		expect(report.boundary).toBe("known");
		expect(report.evidence).toEqual({
			state: "unavailable",
			reasons: ["transcript unavailable"],
		});
	});
});

describe("saved session history API", () => {
	it("serves summary and bounded event detail from the standalone route", async () => {
		const fixture = await writtenAttempt();
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			corpusSource: directorySource(fixture.runsDirectory),
		});

		const summary = await app.request(
			`/api/attempts/session/${fixture.caseId}/${fixture.uuid}/history`,
		);
		const detail = await app.request(
			`/api/attempts/session/${fixture.caseId}/${fixture.uuid}/history/2%3A1`,
		);

		expect(summary.status).toBe(200);
		expect(detail.status).toBe(200);
		expect(await detail.json()).toEqual({
			schemaVersion: 1,
			eventId: "2:1",
			locator: { line: 2, block: 1 },
			kind: "result",
			state: "delivered",
			relatedEventIds: ["1:1"],
			deliveredText: "1\tproject instructions",
			deliveredMeasurement: { state: "complete", characters: 22 },
			snapshotMeasurement: {
				state: "unavailable",
				reasons: ["source snapshot unavailable"],
			},
			applicationTruncated: false,
		});
	});

	it("serves the request series, its cost readings and instruction loads", async () => {
		const fixture = await writtenResumedAttempt();
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			corpusSource: directorySource(fixture.runsDirectory),
		});

		const response = await app.request(
			`/api/attempts/session/${fixture.caseId}/${fixture.uuid}/history/requests`,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			series: {
				name: "total input tokens",
				measuresActiveContextWindow: false,
				boundary: "known",
				attemptTotals: { state: "complete", totalInputTokens: 251_697 },
			},
			cost: {
				reported: { state: "complete", costUsd: 1.008294 },
				calculated: { state: "complete" },
			},
			instructionLoads: { state: "unavailable" },
		});
	});

	it("serves a per-request cost for each attempt-region request", async () => {
		const fixture = await writtenResumedAttempt();
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			corpusSource: directorySource(fixture.runsDirectory),
		});

		const response = await app.request(
			`/api/attempts/session/${fixture.caseId}/${fixture.uuid}/history/requests`,
		);

		expect(await response.json()).toMatchObject({
			requestCosts: [{ line: 2, cost: { state: "priced", costUsd: 1.008294 } }],
		});
	});

	it("leaves the record and transcript byte-identical across repeated series reads", async () => {
		const fixture = await writtenResumedAttempt();
		const paths = sessionAttemptPaths(fixture.runsDirectory, fixture);
		const evidence = [
			paths.recordFile,
			join(paths.directory, "transcript.jsonl"),
		];
		const digests = (): Promise<readonly string[]> =>
			Promise.all(
				evidence.map(async (path) =>
					createHash("sha256")
						.update(await Bun.file(path).bytes())
						.digest("hex"),
				),
			);
		const before = await digests();
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			corpusSource: directorySource(fixture.runsDirectory),
		});
		const route = `/api/attempts/session/${fixture.caseId}/${fixture.uuid}/history/requests`;

		const first = await app.request(route);
		const second = await app.request(route);
		const third = await app.request(route);

		expect([first.status, second.status, third.status]).toEqual([
			200, 200, 200,
		]);
		expect(await digests()).toEqual(before);
	});

	it("refuses a series read whose transcript is a symlink out of the attempt directory", async () => {
		const fixture = await writtenResumedAttempt();
		const paths = sessionAttemptPaths(fixture.runsDirectory, fixture);
		const transcript = join(paths.directory, "transcript.jsonl");
		const outside = join(fixture.runsDirectory, "..", "outside.jsonl");
		await Bun.write(outside, "{}\n");
		await rm(transcript);
		await symlink(outside, transcript);
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			corpusSource: directorySource(fixture.runsDirectory),
		});

		const response = await app.request(
			`/api/attempts/session/${fixture.caseId}/${fixture.uuid}/history/requests`,
		);

		expect(response.status).toBe(400);
		expect(await response.json()).toEqual({
			error: "Saved-attempt evidence is not a real file",
		});
	});

	it("redacts the absolute host paths the instructions attachment records", async () => {
		const fixture = await writtenResumedAttempt();
		const paths = sessionAttemptPaths(fixture.runsDirectory, fixture);
		const transcript = await Bun.file(
			join(paths.directory, "transcript.jsonl"),
		).text();
		await Bun.write(
			join(paths.directory, "transcript.jsonl"),
			`${transcript}\n${JSON.stringify({
				type: "attachment",
				attachment: {
					type: "instructions",
					files: [
						{
							path: join(homedir(), ".claude", "CLAUDE.md"),
							type: "User",
							content: "# secret",
						},
					],
				},
			})}`,
		);
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			corpusSource: directorySource(fixture.runsDirectory),
		});

		const response = await app.request(
			`/api/attempts/session/${fixture.caseId}/${fixture.uuid}/history/requests`,
		);

		const body = await response.text();
		expect(body).not.toContain(homedir());
		expect(JSON.parse(body)).toMatchObject({
			instructionLoads: {
				state: "available",
				loads: [{ filePath: "<path>/CLAUDE.md", memoryType: "User" }],
			},
		});
	});

	it("leaves no directory name when the load sat under a path containing a space", async () => {
		const fixture = await writtenResumedAttempt();
		const paths = sessionAttemptPaths(fixture.runsDirectory, fixture);
		const transcript = await Bun.file(
			join(paths.directory, "transcript.jsonl"),
		).text();
		await Bun.write(
			join(paths.directory, "transcript.jsonl"),
			`${transcript}\n${JSON.stringify({
				type: "attachment",
				attachment: {
					type: "instructions",
					files: [
						{
							path: join(
								homedir(),
								"Library",
								"Application Support",
								"Claude",
								"CLAUDE.md",
							),
							type: "User",
							content: "# secret",
						},
					],
				},
			})}`,
		);
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			corpusSource: directorySource(fixture.runsDirectory),
		});

		const response = await app.request(
			`/api/attempts/session/${fixture.caseId}/${fixture.uuid}/history/requests`,
		);

		const body = await response.text();
		expect(body).not.toContain("Application Support");
		expect(body).not.toContain("Library");
		expect(JSON.parse(body)).toMatchObject({
			instructionLoads: {
				state: "available",
				loads: [{ filePath: "<path>/CLAUDE.md" }],
			},
		});
	});

	it("keeps two loads from one directory distinguishable", async () => {
		const fixture = await writtenResumedAttempt();
		const paths = sessionAttemptPaths(fixture.runsDirectory, fixture);
		const transcript = await Bun.file(
			join(paths.directory, "transcript.jsonl"),
		).text();
		await Bun.write(
			join(paths.directory, "transcript.jsonl"),
			`${transcript}\n${JSON.stringify({
				type: "attachment",
				attachment: {
					type: "instructions",
					files: [
						{
							path: join(homedir(), ".claude", "CLAUDE.md"),
							type: "User",
							content: "a",
						},
						{
							path: join(homedir(), ".claude", "AGENTS.md"),
							type: "User",
							content: "b",
						},
					],
				},
			})}`,
		);
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			corpusSource: directorySource(fixture.runsDirectory),
		});

		const response = await app.request(
			`/api/attempts/session/${fixture.caseId}/${fixture.uuid}/history/requests`,
		);

		expect(await response.json()).toMatchObject({
			instructionLoads: {
				state: "available",
				loads: [
					{ filePath: "<path>/CLAUDE.md", memoryType: "User" },
					{ filePath: "<path>/AGENTS.md", memoryType: "User" },
				],
			},
		});
	});

	it("serves the confirmation rep's series through its own route", async () => {
		const fixture = await writtenConfirmationAttempt();
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			corpusSource: directorySource(fixture.runsDirectory),
		});

		const response = await app.request(
			`/api/groups/${fixture.groupId}/reps/${fixture.repId}/attempt/history/requests`,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			series: { name: "total input tokens", transcriptState: "saved" },
		});
	});

	it("refuses a confirmation series route whose group does not own the rep", async () => {
		const fixture = await writtenConfirmationAttempt();
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			corpusSource: directorySource(fixture.runsDirectory),
		});

		const response = await app.request(
			`/api/groups/${fixture.groupId}/reps/group-a-rep-2/attempt/history/requests`,
		);

		expect(response.status).not.toBe(200);
		expect(await response.text()).not.toContain(fixture.runsDirectory);
	});

	it("returns a redacted refusal for an invalid route identity", async () => {
		const fixture = await writtenAttempt();
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			corpusSource: directorySource(fixture.runsDirectory),
		});

		const response = await app.request(
			`/api/attempts/session/${fixture.caseId}/bad..%2Fid/history`,
		);

		expect(response.status).toBe(400);
		expect(await response.text()).not.toContain(fixture.runsDirectory);
	});
});

describe(readConfirmationAttemptHistory.name, () => {
	it("reads an owned confirmation rep and leaves its evidence byte-identical", async () => {
		const fixture = await writtenConfirmationAttempt();
		const repPaths = fixture.paths.rep(fixture.repId);
		const before = await Promise.all(
			[
				fixture.paths.groupFile,
				repPaths.recordFile,
				repPaths.attemptFile,
				repPaths.transcriptFile,
			].map((path) => Bun.file(path).text()),
		);

		const report = await readConfirmationAttemptHistory(fixture);

		expect(report.attempt).toMatchObject({
			kind: "session",
			id: fixture.repId,
		});
		expect(
			await Promise.all(
				[
					fixture.paths.groupFile,
					repPaths.recordFile,
					repPaths.attemptFile,
					repPaths.transcriptFile,
				].map((path) => Bun.file(path).text()),
			),
		).toEqual(before);
	});

	it("refuses traversal identities", async () => {
		const fixture = await writtenConfirmationAttempt();

		expect(
			readConfirmationAttemptHistory({ ...fixture, repId: "../rep" }),
		).rejects.toBeInstanceOf(SessionHistoryReaderError);
	});

	it.each([
		[
			"group file",
			(fixture: Awaited<ReturnType<typeof writtenConfirmationAttempt>>) =>
				fixture.paths.groupFile,
		],
		[
			"rep file",
			(fixture: Awaited<ReturnType<typeof writtenConfirmationAttempt>>) =>
				fixture.paths.rep(fixture.repId).recordFile,
		],
		[
			"attempt file",
			(fixture: Awaited<ReturnType<typeof writtenConfirmationAttempt>>) =>
				fixture.paths.rep(fixture.repId).attemptFile,
		],
		[
			"transcript file",
			(fixture: Awaited<ReturnType<typeof writtenConfirmationAttempt>>) =>
				fixture.paths.rep(fixture.repId).transcriptFile,
		],
	] as const)("refuses a symlinked %s", async (_name, selectedPath) => {
		const fixture = await writtenConfirmationAttempt();
		const path = selectedPath(fixture);
		const outside = join(fixture.runsDirectory, "outside-file");
		await Bun.write(outside, "outside");
		await rm(path);
		await symlink(outside, path);

		expect(readConfirmationAttemptHistory(fixture)).rejects.toBeInstanceOf(
			SessionHistoryReaderError,
		);
	});

	it.each([
		[
			"group directory",
			(fixture: Awaited<ReturnType<typeof writtenConfirmationAttempt>>) =>
				fixture.paths.directory,
		],
		[
			"rep directory",
			(fixture: Awaited<ReturnType<typeof writtenConfirmationAttempt>>) =>
				fixture.paths.rep(fixture.repId).directory,
		],
	] as const)("refuses a symlinked %s", async (_name, selectedPath) => {
		const fixture = await writtenConfirmationAttempt();
		const path = selectedPath(fixture);
		const outside = join(fixture.runsDirectory, "outside-directory");
		await mkdir(outside);
		await rm(path, { recursive: true });
		await symlink(outside, path);

		expect(readConfirmationAttemptHistory(fixture)).rejects.toBeInstanceOf(
			SessionHistoryReaderError,
		);
	});

	it("refuses a non-regular transcript", async () => {
		const fixture = await writtenConfirmationAttempt();
		const transcript = fixture.paths.rep(fixture.repId).transcriptFile;
		await rm(transcript);
		await mkdir(transcript);

		expect(readConfirmationAttemptHistory(fixture)).rejects.toBeInstanceOf(
			SessionHistoryReaderError,
		);
	});
});

async function writtenResumedAttempt(): Promise<{
	readonly runsDirectory: string;
	readonly caseId: string;
	readonly uuid: string;
}> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-history-series-"));
	roots.push(root);
	const runsDirectory = join(root, ".benchmark-runs");
	const caseId = "case-resumed";
	const uuid = "attempt-resumed";
	const paths = sessionAttemptPaths(runsDirectory, { caseId, uuid });
	await mkdir(paths.directory, { recursive: true });
	const assistant = (
		requestId: string,
		model: string,
		usage: {
			readonly input: number;
			readonly output: number;
			readonly cacheWrite: number;
		},
	): string =>
		JSON.stringify({
			type: "assistant",
			requestId,
			cwd: "/work",
			message: {
				model,
				usage: {
					input_tokens: usage.input,
					output_tokens: usage.output,
					cache_read_input_tokens: 0,
					cache_creation_input_tokens: usage.cacheWrite,
					cache_creation: {
						ephemeral_1h_input_tokens: usage.cacheWrite,
						ephemeral_5m_input_tokens: 0,
					},
				},
				content: [{ type: "text", text: "reply" }],
			},
		});
	const transcript = [
		assistant("req-inherited", "claude-opus-5", {
			input: 7,
			output: 90_592,
			cacheWrite: 9,
		}),
		assistant("req-attempt", "claude-sonnet-5", {
			input: 2,
			output: 151,
			cacheWrite: 251_695,
		}),
	].join("\n");
	const record = sessionAttemptRecordSchema.parse({
		schemaVersion: 1,
		caseId,
		lineage: "lineage-a",
		model: "sonnet",
		sessionBudgetUsd: 2,
		corpusFiles: [],
		prompt: "inspect",
		reply: "done",
		transcriptFile: "/outside/must-not-be-read.jsonl",
		transcriptDiagnostics: {
			state: "complete",
			prefixLinesExcluded: 1,
			sourceLineCount: 2,
			measuredLineCount: 1,
			toolUseOccurrences: { total: 0, byName: [] },
			toolErrors: [],
			repeatedBashCommands: [],
			issues: [],
		},
		metrics: {
			costUsd: 1.008294,
			inputTokens: 2,
			outputTokens: 151,
			cacheReadTokens: 0,
			cacheWriteTokens: 251_695,
			turns: 1,
		},
		outcome: "SUCCESSFUL",
		checks: [{ kind: "word-band", status: "PASS", detail: "1 word" }],
		elapsedMs: 1,
	});
	await Bun.write(paths.recordFile, `${JSON.stringify(record, null, 2)}\n`);
	await Bun.write(join(paths.directory, "transcript.jsonl"), transcript);

	return { runsDirectory, caseId, uuid };
}

describe(readSessionAttemptRequestSeries.name, () => {
	it("totals only the attempt region of a resumed saved attempt", async () => {
		const fixture = await writtenResumedAttempt();

		const { series } = await readSessionAttemptRequestSeries(fixture);

		expect(series.boundary).toBe("known");
		expect(series.attemptTotals).toEqual({
			state: "complete",
			requestCount: 1,
			usage: {
				inputTokens: 2,
				outputTokens: 151,
				cacheReadTokens: 0,
				cacheWriteTokens: 251_695,
			},
			totalInputTokens: 251_697,
		});
	});

	it("reports instruction loads unavailable when the transcript carries no attachment", async () => {
		const fixture = await writtenResumedAttempt();

		const { instructionLoads } = await readSessionAttemptRequestSeries(fixture);

		expect(instructionLoads).toEqual({ state: "unavailable" });
	});

	it("carries the instruction loads the transcript attachment names", async () => {
		const fixture = await writtenResumedAttempt();
		const paths = sessionAttemptPaths(fixture.runsDirectory, fixture);
		const transcript = await Bun.file(
			join(paths.directory, "transcript.jsonl"),
		).text();
		await Bun.write(
			join(paths.directory, "transcript.jsonl"),
			`${transcript}\n${JSON.stringify({
				type: "attachment",
				attachment: {
					type: "instructions",
					files: [
						{ path: "/work/CLAUDE.md", type: "Project", content: "# it" },
					],
				},
			})}`,
		);

		const { instructionLoads } = await readSessionAttemptRequestSeries(fixture);

		expect(instructionLoads).toEqual({
			state: "available",
			loads: [
				{
					filePath: "/work/CLAUDE.md",
					memoryType: "Project",
					loadReason: { state: "unavailable" },
					triggerFilePath: { state: "unavailable" },
					parentFilePath: { state: "unavailable" },
				},
			],
		});
	});

	it("reads the provider cost the attempt record carries", async () => {
		const fixture = await writtenResumedAttempt();

		const { cost } = await readSessionAttemptRequestSeries(fixture);

		expect(cost.reported).toEqual({ state: "complete", costUsd: 1.008294 });
	});

	it("reports totals unavailable rather than zero when the attempt saved no transcript", async () => {
		const root = await mkdtemp(
			join(tmpdir(), "rehearse-history-notranscript-"),
		);
		roots.push(root);
		const runsDirectory = join(root, ".benchmark-runs");
		const caseId = "case-no-transcript";
		const uuid = "attempt-no-transcript";
		const paths = sessionAttemptPaths(runsDirectory, { caseId, uuid });
		await mkdir(paths.directory, { recursive: true });
		await Bun.write(
			paths.recordFile,
			`${JSON.stringify(
				sessionAttemptRecordSchema.parse({
					schemaVersion: 1,
					caseId,
					lineage: "lineage-a",
					model: "sonnet",
					sessionBudgetUsd: 1,
					corpusFiles: [],
					prompt: "inspect",
					reply: "done",
					transcriptFile: "/outside/must-not-be-read.jsonl",
					transcriptDiagnostics: {
						state: "complete",
						prefixLinesExcluded: 1268,
						sourceLineCount: 1291,
						measuredLineCount: 23,
						toolUseOccurrences: { total: 0, byName: [] },
						toolErrors: [],
						repeatedBashCommands: [],
						issues: [],
					},
					metrics: {
						costUsd: 1.008294,
						inputTokens: 2,
						outputTokens: 151,
						cacheReadTokens: 0,
						cacheWriteTokens: 251_695,
						turns: 1,
					},
					outcome: "SUCCESSFUL",
					checks: [{ kind: "word-band", status: "PASS", detail: "1 word" }],
					elapsedMs: 1,
				}),
			)}\n`,
		);

		const { series, cost } = await readSessionAttemptRequestSeries({
			runsDirectory,
			caseId,
			uuid,
		});

		expect(series.transcriptState).toBe("absent");
		expect(series.attemptTotals).toEqual({
			state: "unavailable",
			reasons: ["the attempt has no saved transcript"],
		});
		expect(cost.calculated).toEqual({
			state: "unavailable",
			reasons: ["the attempt has no saved transcript"],
		});
	});

	it("reports boundary-unknown with totals unavailable on an attempt carrying no boundary", async () => {
		const root = await mkdtemp(join(tmpdir(), "rehearse-history-noboundary-"));
		roots.push(root);
		const runsDirectory = join(root, ".benchmark-runs");
		const caseId = "case-no-boundary";
		const uuid = "attempt-no-boundary";
		const paths = sessionAttemptPaths(runsDirectory, { caseId, uuid });
		await mkdir(paths.directory, { recursive: true });
		await Bun.write(
			paths.recordFile,
			`${JSON.stringify(
				sessionAttemptRecordSchema.parse({
					schemaVersion: 1,
					caseId,
					lineage: "lineage-a",
					model: "sonnet",
					sessionBudgetUsd: 1,
					corpusFiles: [],
					prompt: "inspect",
					reply: "done",
					transcriptFile: "/outside/must-not-be-read.jsonl",
					outcome: "SUCCESSFUL",
					checks: [{ kind: "word-band", status: "PASS", detail: "1 word" }],
					elapsedMs: 1,
				}),
			)}\n`,
		);
		await Bun.write(
			join(paths.directory, "transcript.jsonl"),
			JSON.stringify({
				type: "assistant",
				requestId: "req-a",
				cwd: "/work",
				message: {
					model: "claude-sonnet-5",
					usage: {
						input_tokens: 2,
						output_tokens: 151,
						cache_read_input_tokens: 0,
						cache_creation_input_tokens: 251_695,
						cache_creation: {
							ephemeral_1h_input_tokens: 251_695,
							ephemeral_5m_input_tokens: 0,
						},
					},
					content: [{ type: "text", text: "reply" }],
				},
			}),
		);

		const { series, cost } = await readSessionAttemptRequestSeries({
			runsDirectory,
			caseId,
			uuid,
		});

		expect(series.boundary).toBe("unknown");
		expect(series.entries.map(({ region }) => region)).toEqual([
			"boundary-unknown",
		]);
		expect(series.attemptTotals).toEqual({
			state: "unavailable",
			reasons: ["the transcript carries no attempt boundary"],
		});
		expect(cost.calculated).toEqual({
			state: "unavailable",
			reasons: ["the transcript carries no attempt boundary"],
		});
	});
});

describe(readConfirmationAttemptRequestSeries.name, () => {
	it("reads the series of the rep it was asked for", async () => {
		const fixture = await writtenConfirmationAttempt();

		const { series } = await readConfirmationAttemptRequestSeries(fixture);

		expect(series.transcriptState).toBe("saved");
		expect(series.boundary).toBe("unknown");
		expect(series.attemptTotals).toEqual({
			state: "unavailable",
			reasons: ["the transcript carries no attempt boundary"],
		});
	});

	it("refuses a rep whose group does not own it", async () => {
		const fixture = await writtenConfirmationAttempt();

		expect(
			readConfirmationAttemptRequestSeries({
				...fixture,
				repId: "group-a-rep-2",
			}),
		).rejects.toBeInstanceOf(SessionHistoryReaderError);
	});
});

interface StageFixture {
	readonly runsDirectory: string;
	readonly run: string;
	readonly stage: string;
	readonly caseId: string;
}

const STAGE_TRANSCRIPT = [
	JSON.stringify({
		type: "assistant",
		cwd: "/wt",
		message: {
			content: [
				{
					type: "tool_use",
					id: "read-1",
					name: "Read",
					input: { file_path: `${homedir()}/.claude/CLAUDE.md` },
				},
			],
		},
	}),
	JSON.stringify({
		type: "user",
		cwd: "/wt",
		message: {
			content: [
				{
					type: "tool_result",
					tool_use_id: "read-1",
					content: "1\tcorpus instructions",
				},
			],
		},
	}),
].join("\n");

type StageTranscriptMode = "available" | "unavailable" | "absent";

function checkpointWithTranscript(
	declared: Readonly<Record<string, JsonValue>>,
	mode: StageTranscriptMode,
): JsonValue {
	if (mode === "available") {
		return {
			...declared,
			transcript: {
				status: "AVAILABLE",
				sessionId: "session-1",
				file: "transcript.jsonl",
			},
		};
	}

	if (mode === "unavailable") {
		return {
			...declared,
			transcript: { status: "UNAVAILABLE", sessionId: "session-1" },
		};
	}

	return declared;
}

async function writtenStage(
	options: { readonly transcript?: StageTranscriptMode } = {},
): Promise<StageFixture> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-stage-reader-"));
	roots.push(root);
	const runsDirectory = join(root, ".benchmark-runs");
	const run = "2026-09-06T21-58-29.508Z";
	const stage = "shape";
	const caseId = "audit-log";
	const paths = benchmarkRunPaths(runsDirectory, run);
	const directory = paths.checkpointDirectory(stage);
	await mkdir(directory, { recursive: true });
	await writeRunManifest(paths.manifestFile, {
		caseId,
		timestamp: "2026-09-06T21:58:29.508Z",
		controlSha: "control-sha",
		sourceRoot: "/src",
		sourceSha: "source-sha",
		taskId: "TASK-1",
		taskSha: "task-sha",
		task: "Task text",
		productBrief: "Brief text",
		model: "sonnet",
		judgeModel: "opus",
		sessionBudgetUsd: 5,
		pipeline: {
			statuses: ["To Do", "Done"],
			target: TEST_TARGET,
			stages: [
				{
					name: stage,
					kind: "delivery",
					skill: "shape",
					rubric: "rubrics/shape.json",
				},
			],
		},
		pipelinePath: "pipelines/default.json",
	});
	const mode = options.transcript ?? "available";
	const declared = {
		stage,
		targetSha: "target-sha",
		lineage: "lineage-1",
		upstream: "upstream-1",
		model: "sonnet",
		corpusFiles: [
			{ path: "CLAUDE.md", sha256: "a".repeat(64) },
			{ path: "skills/build/SKILL.md", sha256: "b".repeat(64) },
		],
		artifacts: [],
		workflowState: [],
	};
	await Bun.write(
		join(directory, "checkpoint.json"),
		`${JSON.stringify(checkpointWithTranscript(declared, mode))}\n`,
	);
	if (mode === "available") {
		await Bun.write(join(directory, "transcript.jsonl"), STAGE_TRANSCRIPT);
	}

	return { runsDirectory, run, stage, caseId };
}

describe(readStageHistory.name, () => {
	it("renders a stage's events in source order under a stage identity", async () => {
		const fixture = await writtenStage();

		const report = await readStageHistory(fixture);

		expect(report.attempt).toEqual({
			kind: "stage",
			caseId: "audit-log",
			run: fixture.run,
			stage: "shape",
			lineage: "lineage-1",
			upstream: "upstream-1",
			model: "sonnet",
			corpusFiles: [
				{ path: "CLAUDE.md", sha256: "a".repeat(64) },
				{ path: "skills/build/SKILL.md", sha256: "b".repeat(64) },
			],
		});
		expect(report.evidence).toEqual({ state: "complete" });
		expect(report.boundary).toBe("known");
		expect(report.startingContext).toEqual([]);
		expect(
			report.attemptEvents.map(({ id, state }) => ({ id, state })),
		).toEqual([
			{ id: "1:1", state: "invoked" },
			{ id: "2:1", state: "delivered" },
		]);
		expect(report.sources.map(({ kind, name }) => ({ kind, name }))).toEqual([
			{ kind: "corpus", name: "CLAUDE.md" },
		]);
	});

	it("names a stage recording no provider transcript apart from one recording no capture", async () => {
		const recorded = await readStageHistory(
			await writtenStage({ transcript: "unavailable" }),
		);
		const absent = await readStageHistory(
			await writtenStage({ transcript: "absent" }),
		);

		expect(recorded.evidence).toEqual({
			state: "unavailable",
			reasons: ["the provider wrote no transcript for this stage session"],
		});
		expect(absent.evidence).toEqual({
			state: "unavailable",
			reasons: ["no raw transcript capture was recorded for this stage"],
		});
		expect(recorded.attemptEvents).toEqual([]);
		expect(absent.attemptEvents).toEqual([]);
	});

	it("keeps two stages of one run and one stage across two runs separate", async () => {
		const fixture = await writtenStage();
		const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
		const buildDirectory = paths.checkpointDirectory("build");
		await mkdir(buildDirectory, { recursive: true });
		await Bun.write(
			join(buildDirectory, "checkpoint.json"),
			`${JSON.stringify(
				checkpointWithTranscript(
					{
						stage: "build",
						targetSha: "target-sha",
						lineage: "lineage-2",
						upstream: "lineage-1",
						model: "sonnet",
						corpusFiles: [],
						artifacts: [],
						workflowState: [],
					},
					"available",
				),
			)}\n`,
		);
		await Bun.write(
			join(buildDirectory, "transcript.jsonl"),
			JSON.stringify({
				type: "assistant",
				cwd: "/wt",
				message: {
					content: [
						{
							type: "tool_use",
							id: "read-9",
							name: "Read",
							input: { file_path: "/wt/only-in-build.ts" },
						},
					],
				},
			}),
		);
		const otherRun = await writtenStage();

		const [firstStage, secondStage, sameStageOtherRun] = await Promise.all([
			readStageHistory(fixture),
			readStageHistory({ ...fixture, stage: "build" }),
			readStageHistory(otherRun),
		]);

		expect(firstStage.sources.map(({ name }) => name)).toEqual(["CLAUDE.md"]);
		expect(secondStage.sources.map(({ name }) => name)).toEqual([
			"only-in-build.ts",
		]);
		expect(firstStage.attempt).not.toEqual(secondStage.attempt);
		expect(sameStageOtherRun.sources.map(({ name }) => name)).toEqual([
			"CLAUDE.md",
		]);
		expect(firstStage.attemptEvents).toEqual(sameStageOtherRun.attemptEvents);
		expect(
			[...firstStage.attemptEvents, ...secondStage.attemptEvents].length,
		).toBeGreaterThan(secondStage.attemptEvents.length);
	});

	it("names a checkpoint claiming a transcript whose file is gone", async () => {
		const fixture = await writtenStage();
		const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
		await rm(
			join(paths.checkpointDirectory(fixture.stage), "transcript.jsonl"),
		);

		const report = await readStageHistory(fixture);

		expect(report.evidence).toEqual({
			state: "unavailable",
			reasons: [
				"the checkpoint records a transcript whose file is no longer beside it",
			],
		});
		expect(report.attemptEvents).toEqual([]);
	});

	it("refuses a stage whose checkpoint names another stage", async () => {
		const fixture = await writtenStage();
		const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
		await mkdir(paths.checkpointDirectory("build"), { recursive: true });
		await Bun.write(
			join(paths.checkpointDirectory("build"), "checkpoint.json"),
			await Bun.file(
				join(paths.checkpointDirectory("shape"), "checkpoint.json"),
			).text(),
		);

		expect(
			readStageHistory({ ...fixture, stage: "build" }),
		).rejects.toBeInstanceOf(SessionHistoryReaderError);
	});

	it.each([
		["run segment", "../escape"],
		["stage segment", "../shape"],
	] as const)("refuses a traversing %s", async (name, segment) => {
		const fixture = await writtenStage();

		expect(
			readStageHistory(
				name === "run segment"
					? { ...fixture, run: segment }
					: { ...fixture, stage: segment },
			),
		).rejects.toMatchObject({ kind: "refused" });
	});

	it("refuses a traversing stage segment on a run that also stopped", async () => {
		const fixture = await writtenStoppedRun();

		expect(
			readStageHistory({ ...fixture, stage: "../build" }),
		).rejects.toMatchObject({ kind: "refused" });
	});

	it("refuses a symlinked stage transcript", async () => {
		const fixture = await writtenStage();
		const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
		const directory = paths.checkpointDirectory(fixture.stage);
		const outside = join(fixture.runsDirectory, "outside.jsonl");
		await Bun.write(outside, "secret");
		await rm(join(directory, "transcript.jsonl"));
		await symlink(outside, join(directory, "transcript.jsonl"));

		expect(readStageHistory(fixture)).rejects.toBeInstanceOf(
			SessionHistoryReaderError,
		);
	});

	it("refuses a symlinked checkpoint directory", async () => {
		const fixture = await writtenStage();
		const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
		const directory = paths.checkpointDirectory(fixture.stage);
		const outside = join(fixture.runsDirectory, "outside-stage");
		await mkdir(outside);
		await Bun.write(join(outside, "checkpoint.json"), "{}");
		await rm(directory, { recursive: true });
		await symlink(outside, directory);

		expect(readStageHistory(fixture)).rejects.toBeInstanceOf(
			SessionHistoryReaderError,
		);
	});

	it("reads the run manifest through the same verified handle the other records use", async () => {
		const fixture = await writtenStage();
		const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
		const outside = join(fixture.runsDirectory, "outside-manifest.json");
		await Bun.write(outside, await Bun.file(paths.manifestFile).text());
		await rm(paths.manifestFile);
		await symlink(outside, paths.manifestFile);

		expect(readStageHistory(fixture)).rejects.toBeInstanceOf(
			SessionHistoryReaderError,
		);
	});

	it("leaves the checkpoint and its transcript byte-identical", async () => {
		const fixture = await writtenStage();
		const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
		const directory = paths.checkpointDirectory(fixture.stage);
		const before = await Promise.all(
			["checkpoint.json", "transcript.jsonl"].map((name) =>
				Bun.file(join(directory, name)).text(),
			),
		);

		await readStageHistory(fixture);

		expect(
			await Promise.all(
				["checkpoint.json", "transcript.jsonl"].map((name) =>
					Bun.file(join(directory, name)).text(),
				),
			),
		).toEqual(before);
	});

	it("names a stage the run stopped on rather than reporting it absent", async () => {
		const fixture = await writtenStoppedRun();

		const report = await readStageHistory(fixture);

		expect(report.attempt).toEqual({
			kind: "stopped-stage",
			caseId: "audit-log",
			run: fixture.run,
			stage: "build",
			error: "build stage graded F; minimum grade is B",
			model: "sonnet",
			corpusFiles: [],
		});
		expect(report.evidence).toEqual({
			state: "unavailable",
			reasons: ["this stage stopped before recording a transcript"],
		});
	});

	it("keeps a stopped stage's parsed exchanges out of every event ledger", async () => {
		const fixture = await writtenStoppedRun();

		const report = await readStageHistory(fixture);

		expect(report.startingContext).toEqual([]);
		expect(report.attemptEvents).toEqual([]);
		expect(report.boundaryUnknown).toEqual([]);
		expect(report.sources).toEqual([]);
		expect(report.startingSources).toEqual([]);
		expect(JSON.stringify(report)).not.toContain(STOPPED_STAGE_SESSION_ID);
		expect(JSON.stringify(report)).not.toContain(STOPPED_STAGE_EXCHANGE_TEXT);
	});

	it("reads a stopped stage against a boundary it knows", async () => {
		const fixture = await writtenStoppedRun();

		const report = await readStageHistory(fixture);

		expect(report.boundary).toEqual("known");
	});

	it("reports no lineage for a stopped stage rather than a derived one", async () => {
		const fixture = await writtenStoppedRun();

		const report = await readStageHistory(fixture);

		expect(Object.keys(report.attempt)).not.toContain("lineage");
		expect(Object.keys(report.attempt)).not.toContain("upstream");
	});

	it.each([
		["a judged stage that did not stop", "discuss"],
		["a stage with no record at all", "nonexistent"],
	] as const)("reports %s as absent", async (_name, stage) => {
		const fixture = await writtenStoppedRun();

		expect(readStageHistory({ ...fixture, stage })).rejects.toMatchObject({
			kind: "not-found",
		});
	});

	it("reports a stopped run whose manifest is missing as absent", async () => {
		const root = await mkdtemp(join(tmpdir(), "rehearse-stopped-reader-"));
		roots.push(root);
		const runsDirectory = join(root, ".benchmark-runs");
		const runs = new RecordedRunsFixture(runsDirectory);
		await runs.writeStoppedRunWithoutManifest();

		expect(
			readStageHistory({ runsDirectory, run: runs.stoppedRun, stage: "build" }),
		).rejects.toMatchObject({ kind: "not-found" });
	});

	it("reconciles a stopped stage's declared corpus as unobserved rather than absent", async () => {
		const fixture = await writtenStoppedRun();
		const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
		await Bun.write(
			paths.stageFile("build"),
			JSON.stringify({
				status: "STAGE_JUDGE_FAILED",
				stage: "build",
				error: "build stage graded C; minimum grade is B",
				corpusFiles: [{ path: "CLAUDE.md", sha256: "a".repeat(64) }],
			}),
		);

		const report = await readStageHistory(fixture);

		expect(stageCorpusReconciliation(report)).toEqual([
			{ path: "CLAUDE.md", state: "no-observation-recorded" },
		]);
	});

	it("names the stop without asserting a grade, for a stage a signal stopped", async () => {
		const fixture = await writtenStoppedRun();
		const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
		await Bun.write(
			paths.stageFile("build"),
			JSON.stringify({
				status: "STAGE_JUDGE_FAILED",
				stage: "build",
				error: "run interrupted by SIGINT",
			}),
		);

		const report = await readStageHistory(fixture);

		expect(report.evidence).toEqual({
			state: "unavailable",
			reasons: ["this stage stopped before recording a transcript"],
		});
		expect(report.attempt).toMatchObject({
			error: "run interrupted by SIGINT",
		});
	});

	it("reports the stop when the record's declared corpus is unreadable", async () => {
		const fixture = await writtenStoppedRun();
		const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
		await Bun.write(
			paths.stageFile("build"),
			JSON.stringify({
				status: "STAGE_JUDGE_FAILED",
				stage: "build",
				error: "build stage graded C; minimum grade is B",
				corpusFiles: [{ path: "CLAUDE.md" }],
			}),
		);

		const report = await readStageHistory(fixture);

		expect(report.attempt).toMatchObject({
			error: "build stage graded C; minimum grade is B",
			corpusFiles: [],
		});
	});

	it("reports the model the stopped stage recorded rather than the run's", async () => {
		const fixture = await writtenStoppedRun();
		const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
		await Bun.write(
			paths.stageFile("build"),
			JSON.stringify({
				status: "STAGE_JUDGE_FAILED",
				stage: "build",
				error: "build stage graded C; minimum grade is B",
				model: "opus",
			}),
		);

		const report = await readStageHistory(fixture);

		expect(report.attempt).toMatchObject({ model: "opus" });
	});

	it("keeps an absolute host path out of a stopped stage's reason", async () => {
		const fixture = await writtenStoppedRun();
		const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
		await Bun.write(
			paths.stageFile("build"),
			JSON.stringify({
				status: "STAGE_JUDGE_FAILED",
				stage: "build",
				error: `build stage rubric missing at ${join(homedir(), "secrets", "rubric.json")}`,
			}),
		);

		const report = await readStageHistory(fixture);

		expect(JSON.stringify(report)).not.toContain(homedir());
	});

	it("refuses a stop record filed under another stage", async () => {
		const fixture = await writtenStoppedRun();
		const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
		await Bun.write(
			paths.stageFile("review"),
			await Bun.file(paths.stageFile("build")).text(),
		);

		expect(
			readStageHistory({ ...fixture, stage: "review" }),
		).rejects.toMatchObject({ kind: "refused" });
	});
});

describe("saved history for a stage whose judging never completed", () => {
	it("names a stage whose judging never completed rather than reporting it absent", async () => {
		const fixture = await writtenAwaitingJudgeRun();

		const report = await readStageHistory(fixture);

		expect(report.attempt).toEqual({
			kind: "awaiting-judge-stage",
			caseId: "audit-log",
			run: fixture.run,
			stage: "build",
			model: "sonnet",
			corpusFiles: [],
		});
		expect(report.evidence).toEqual({
			state: "unavailable",
			reasons: [
				"this stage ran and its judging never completed, so no transcript was recorded",
			],
		});
	});

	it("keeps an unjudged stage's parsed exchanges out of every event ledger", async () => {
		const fixture = await writtenAwaitingJudgeRun();

		const report = await readStageHistory(fixture);

		expect(report.startingContext).toEqual([]);
		expect(report.attemptEvents).toEqual([]);
		expect(report.boundaryUnknown).toEqual([]);
		expect(report.sources).toEqual([]);
		expect(report.startingSources).toEqual([]);
		expect(JSON.stringify(report)).not.toContain(AWAITING_JUDGE_SESSION_ID);
		expect(JSON.stringify(report)).not.toContain(AWAITING_JUDGE_EXCHANGE_TEXT);
	});

	it("reports no lineage for an unjudged stage rather than a derived one", async () => {
		const fixture = await writtenAwaitingJudgeRun();

		const report = await readStageHistory(fixture);

		expect(Object.keys(report.attempt)).not.toContain("lineage");
		expect(Object.keys(report.attempt)).not.toContain("upstream");
	});

	it("does not describe an unjudged stage as stopped", async () => {
		const fixture = await writtenAwaitingJudgeRun();

		const report = await readStageHistory(fixture);

		expect(Object.keys(report.attempt)).not.toContain("error");
		expect(JSON.stringify(report)).not.toContain("stopped");
	});

	it("refuses an awaiting-judge record filed under another stage", async () => {
		const fixture = await writtenAwaitingJudgeRun();
		const paths = benchmarkRunPaths(fixture.runsDirectory, fixture.run);
		await Bun.write(
			paths.stageFile("review"),
			await Bun.file(paths.stageFile("build")).text(),
		);

		expect(
			readStageHistory({ ...fixture, stage: "review" }),
		).rejects.toMatchObject({ kind: "refused" });
	});

	it("reports a stage with no record at all as absent", async () => {
		const fixture = await writtenAwaitingJudgeRun();

		expect(
			readStageHistory({ ...fixture, stage: "discuss" }),
		).rejects.toMatchObject({ kind: "not-found" });
	});
});

interface StoppedStageFixture {
	readonly runsDirectory: string;
	readonly run: string;
	readonly stage: string;
}

async function writtenAwaitingJudgeRun(): Promise<StoppedStageFixture> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-awaiting-reader-"));
	roots.push(root);
	const runsDirectory = join(root, ".benchmark-runs");
	const fixture = new RecordedRunsFixture(runsDirectory);
	await fixture.writeAwaitingJudgeRun();

	return { runsDirectory, run: fixture.awaitingJudgeRun, stage: "build" };
}

async function writtenStoppedRun(): Promise<StoppedStageFixture> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-stopped-reader-"));
	roots.push(root);
	const runsDirectory = join(root, ".benchmark-runs");
	const fixture = new RecordedRunsFixture(runsDirectory);
	await fixture.writeStoppedRun();

	return { runsDirectory, run: fixture.stoppedRun, stage: "build" };
}

describe("saved stage history API", () => {
	it("serves a stage summary, its event detail and its corpus reconciliation", async () => {
		const fixture = await writtenStage();
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			corpusSource: directorySource(fixture.runsDirectory),
		});

		const summary = await app.request(
			`/api/runs/${fixture.run}/stages/${fixture.stage}/history`,
		);
		const detail = await app.request(
			`/api/runs/${fixture.run}/stages/${fixture.stage}/history/2%3A1`,
		);
		const corpus = await app.request(
			`/api/runs/${fixture.run}/stages/${fixture.stage}/history/corpus`,
		);

		expect(summary.status).toBe(200);
		expect(detail.status).toBe(200);
		expect(corpus.status).toBe(200);
		expect(await corpus.json()).toEqual([
			{
				path: "CLAUDE.md",
				state: "observed",
				firstLocator: { line: 1, block: 1 },
			},
			{ path: "skills/build/SKILL.md", state: "no-observation-recorded" },
		]);
	});

	it("refuses a traversing run segment without leaking an absolute path", async () => {
		const fixture = await writtenStage();
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			corpusSource: directorySource(fixture.runsDirectory),
		});

		const response = await app.request(
			`/api/runs/${encodeURIComponent("../escape")}/stages/shape/history`,
		);

		expect(response.status).toBe(400);
		expect(JSON.stringify(await response.json())).not.toContain(
			fixture.runsDirectory,
		);
	});
});

/**
 * A replay's scorecard carries its session id and parsed exchanges. The report
 * must not render either as raw evidence, so the tests name them here and then
 * assert the serialized report holds neither.
 */
const REPLAY_SESSION_ID = "1ad63c8d-75ec-4b27-8ff1-751826f6849e";
const REPLAY_EXCHANGE_TEXT = "the replayed stage answered";

async function writtenReplay(): Promise<{
	readonly runsDirectory: string;
	readonly lineage: string;
	readonly timestamp: string;
}> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-replay-history-"));
	roots.push(root);
	const runsDirectory = join(root, ".benchmark-runs");
	const lineage = "lineage-discuss";
	const timestamp = "2026-09-06T22-33-15.057Z";
	const runName = "2026-09-06T21-58-29.508Z";
	const recordedTimestamp = "2026-09-06T22:33:15.057Z";
	const recordFile = replayRecordFile(runsDirectory, lineage, timestamp);
	await mkdir(join(runsDirectory, "replays", lineage), { recursive: true });
	const paths = benchmarkRunPaths(runsDirectory, runName);
	await mkdir(paths.checkpointsDirectory, { recursive: true });
	await writeRunManifest(paths.manifestFile, {
		caseId: "audit-log",
		timestamp: "2026-09-06T21:58:29.508Z",
		controlSha: "control-sha",
		sourceRoot: "/src",
		sourceSha: "source-sha",
		taskId: "TASK-1",
		taskSha: "task-sha",
		task: "Task text",
		productBrief: "Brief text",
		model: "sonnet",
		judgeModel: "opus",
		sessionBudgetUsd: 5,
		pipeline: {
			statuses: ["To Do", "Done"],
			target: TEST_TARGET,
			stages: [
				{
					name: "build",
					kind: "delivery",
					skill: "build",
					rubric: "rubrics/build.json",
				},
			],
		},
		pipelinePath: "pipelines/default.json",
	});
	await Bun.write(
		recordFile,
		`${JSON.stringify({
			replay: true,
			timestamp: recordedTimestamp,
			runName,
			stage: "build",
			consumed: {
				stage: "discuss",
				lineage,
				targetSha: "2".repeat(40),
			},
			baseSha: "2".repeat(40),
			lineage: "lineage-build",
			corpusFiles: [
				{ path: "CLAUDE.md", sha256: "a".repeat(64) },
				{ path: "skills/build/SKILL.md", sha256: "b".repeat(64) },
			],
			model: "sonnet",
			judgeModel: "opus",
			sessionBudgetUsd: 5,
			controlSha: "1".repeat(40),
			stageCostUsd: 1,
			productOwnerCostUsd: 0.25,
			judgeCostUsd: 0.5,
			stale: false,
			staleness: [],
			scorecard: {
				stage: "build",
				costUsd: 1,
				grade: { grade: "A", verdict: "CONTINUE", dimensions: [] },
				input: {
					stage: "build",
					transcript: {
						stage: "build",
						sessionId: REPLAY_SESSION_ID,
						costUsd: 1,
						providerCalls: [],
						exchanges: [
							{ agent: REPLAY_EXCHANGE_TEXT },
							{ agent: "answered again" },
						],
					},
				},
			},
		})}\n`,
	);

	return { runsDirectory, lineage, timestamp };
}

describe(readReplayHistory.name, () => {
	it("names a replay as retaining no raw capture under a stage identity", async () => {
		const fixture = await writtenReplay();

		const report = await readReplayHistory(fixture);

		expect(report.attempt).toEqual({
			kind: "stage",
			caseId: "audit-log",
			run: "2026-09-06T21-58-29.508Z",
			stage: "build",
			lineage: "lineage-build",
			upstream: "lineage-discuss",
			model: "sonnet",
			corpusFiles: [
				{ path: "CLAUDE.md", sha256: "a".repeat(64) },
				{ path: "skills/build/SKILL.md", sha256: "b".repeat(64) },
			],
		});
		expect(report.evidence).toEqual({
			state: "unavailable",
			reasons: ["a replay retains no raw transcript for its stage session"],
		});
	});

	it("keeps a replay's parsed exchanges out of every event ledger", async () => {
		const fixture = await writtenReplay();

		const report = await readReplayHistory(fixture);

		expect(report.startingContext).toEqual([]);
		expect(report.attemptEvents).toEqual([]);
		expect(report.boundaryUnknown).toEqual([]);
		expect(report.sources).toEqual([]);
		expect(JSON.stringify(report)).not.toContain(REPLAY_SESSION_ID);
		expect(JSON.stringify(report)).not.toContain(REPLAY_EXCHANGE_TEXT);
	});

	it("refuses a replay record filed under another lineage", async () => {
		const fixture = await writtenReplay();
		const recordFile = replayRecordFile(
			fixture.runsDirectory,
			"lineage-other",
			fixture.timestamp,
		);
		await mkdir(join(fixture.runsDirectory, "replays", "lineage-other"), {
			recursive: true,
		});
		await Bun.write(
			recordFile,
			await Bun.file(
				replayRecordFile(
					fixture.runsDirectory,
					fixture.lineage,
					fixture.timestamp,
				),
			).text(),
		);

		expect(
			readReplayHistory({
				runsDirectory: fixture.runsDirectory,
				lineage: "lineage-other",
				timestamp: fixture.timestamp,
			}),
		).rejects.toThrow(SessionHistoryReaderError);
	});

	it("refuses a traversing lineage segment without leaking an absolute path", async () => {
		const fixture = await writtenReplay();

		expect(
			readReplayHistory({
				runsDirectory: fixture.runsDirectory,
				lineage: "../escape",
				timestamp: fixture.timestamp,
			}),
		).rejects.toThrow(SessionHistoryReaderError);
	});
});

describe("saved replay history API", () => {
	it("serves a replay's unavailable report", async () => {
		const fixture = await writtenReplay();
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			corpusSource: directorySource(fixture.runsDirectory),
		});

		const response = await app.request(
			`/api/replays/${fixture.lineage}/${fixture.timestamp}/history`,
		);

		expect(response.status).toBe(200);
		expect(await response.json()).toMatchObject({
			evidence: {
				state: "unavailable",
				reasons: ["a replay retains no raw transcript for its stage session"],
			},
			attempt: { kind: "stage", stage: "build" },
		});
	});

	it("refuses a traversing replay lineage without leaking an absolute path", async () => {
		const fixture = await writtenReplay();
		const app = createApiApp({
			runsDirectory: fixture.runsDirectory,
			liveness: nothingRunning,
			corpusSource: directorySource(fixture.runsDirectory),
		});

		const response = await app.request(
			`/api/replays/${encodeURIComponent("../escape")}/${fixture.timestamp}/history`,
		);

		expect(response.status).toBe(400);
		expect(JSON.stringify(await response.json())).not.toContain(
			fixture.runsDirectory,
		);
	});
});
