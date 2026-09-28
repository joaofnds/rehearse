import { describe, expect, it } from "bun:test";
import type {
	ConfirmationGroupRecord,
	ConfirmationRepRecord,
	SessionConfirmationGroupRecord,
	SessionConfirmationRepRecord,
} from "./confirmation-record";
import {
	parseConfirmationGroupRecord,
	parseConfirmationRepRecord,
} from "./confirmation-record";

describe(parseConfirmationRepRecord.name, () => {
	function completeRepRecord(): ConfirmationRepRecord {
		const resultSha = "a".repeat(40);
		const metrics = {
			costUsd: 0.5,
			inputTokens: 100,
			outputTokens: 20,
			cacheReadTokens: 30,
			cacheWriteTokens: 40,
			turns: 3,
		};

		return {
			schemaVersion: 1,
			caseId: "audit-log",
			groupId: "group-1",
			repId: "group-1-rep-1",
			ordinal: 1,
			mode: "pipeline",
			worktreePath: "/worktrees/group-1-rep-1",
			lineage: { kind: "SOURCE", sha: resultSha },
			outcome: "SUCCESSFUL",
			stages: [
				{
					stage: "shape",
					status: "JUDGED",
					grade: "A",
					verdict: "CONTINUE",
					elapsedMs: 120,
					evidence: {
						resultSha,
						recordFile: "stages/shape.json",
					},
				},
			],
			finalOutcome: {
				status: "JUDGED",
				verdict: "PASS",
				evidence: {
					resultSha,
					recordFile: "rep.json",
				},
			},
			metrics: {
				status: "COMPLETE",
				calls: [
					{ role: "worker", metrics },
					{ role: "product-owner", metrics: { ...metrics, turns: 1 } },
					{ role: "stage-judge", metrics: { ...metrics, turns: 2 } },
					{ role: "final-judge", metrics: { ...metrics, turns: 2 } },
				],
			},
			workerTrajectorySteps: 3,
			elapsedMs: 500,
		};
	}

	function sessionRepRecord(): SessionConfirmationRepRecord {
		const workerMetrics = {
			costUsd: 0.5,
			inputTokens: 100,
			outputTokens: 20,
			cacheReadTokens: 30,
			cacheWriteTokens: 40,
			turns: 3,
		};

		return {
			schemaVersion: 2 as const,
			caseId: "smoke",
			groupId: "session-group",
			repId: "session-group-rep-1",
			ordinal: 1,
			mode: "session" as const,
			lineage: { kind: "SESSION" as const, lineage: "lineage-1" },
			outcome: "SUCCESSFUL" as const,
			stages: [
				{
					stage: "checks" as const,
					status: "JUDGED" as const,
					grade: "A" as const,
					verdict: "CONTINUE" as const,
					elapsedMs: 10,
					evidence: { recordFile: "attempt.json" },
				},
			],
			finalOutcome: { status: "NOT_APPLICABLE" as const },
			metrics: {
				status: "COMPLETE" as const,
				calls: [{ role: "worker" as const, metrics: workerMetrics }],
			},
			workerTrajectorySteps: 3,
			elapsedMs: 10,
		};
	}

	it("accepts complete role-attributed evidence", () => {
		const record = completeRepRecord();

		expect(parseConfirmationRepRecord(JSON.stringify(record))).toEqual(record);
	});

	it("reads a rep record without a caseId as the audit-log case", () => {
		const { caseId: _caseId, ...legacy } = completeRepRecord();

		expect(parseConfirmationRepRecord(JSON.stringify(legacy)).caseId).toBe(
			"audit-log",
		);
	});

	it("keeps schema version 1 while carrying the case", () => {
		expect(completeRepRecord().schemaVersion).toBe(1);
	});

	it("rejects unknown fields", () => {
		const record = { ...completeRepRecord(), extra: true };

		expect(() => parseConfirmationRepRecord(JSON.stringify(record))).toThrow();
	});

	it("accepts retained evidence for a failed final Judge", () => {
		const record = {
			...completeRepRecord(),
			outcome: "UNSUCCESSFUL" as const,
			finalOutcome: {
				status: "EXECUTION_FAILED" as const,
				error: "Judge rejected both attempts",
				evidence: {
					resultSha: "a".repeat(40),
					recordFile: "final.json",
				},
			},
		};

		expect(parseConfirmationRepRecord(JSON.stringify(record))).toEqual(record);
	});

	it("rejects success when required provider metrics are missing", () => {
		const record = {
			...completeRepRecord(),
			metrics: {
				status: "MISSING",
				calls: [],
				missing: ["worker.inputTokens"],
			},
		};

		expect(() => parseConfirmationRepRecord(JSON.stringify(record))).toThrow(
			"Missing provider metrics cannot produce a successful rep",
		);
	});

	it("accepts a session rep at schema version 1, with its checks as one stage", () => {
		const base = completeRepRecord();
		const record: ConfirmationRepRecord = {
			...base,
			caseId: "smoke",
			mode: "session",
			worktreePath: "/tmp/rehearse-attempt-abc",
			stages: [
				{
					stage: "checks",
					status: "JUDGED",
					grade: "A",
					verdict: "CONTINUE",
					elapsedMs: 1600,
					evidence: {
						resultSha: "a".repeat(40),
						recordFile: "attempt.json",
					},
				},
			],
			finalOutcome: { status: "NOT_APPLICABLE" },
		};

		expect(parseConfirmationRepRecord(JSON.stringify(record))).toEqual(record);
	});

	it("keeps a v1 stage rep parsing unchanged beside the session mode", () => {
		const record: ConfirmationRepRecord = {
			...completeRepRecord(),
			mode: "stage",
			finalOutcome: { status: "NOT_APPLICABLE" },
		};

		expect(parseConfirmationRepRecord(JSON.stringify(record))).toEqual(record);
	});

	it("refuses a session rep called successful when its checks failed", () => {
		const base = completeRepRecord();
		const record = {
			...base,
			mode: "session",
			finalOutcome: { status: "NOT_APPLICABLE" },
			stages: [
				{
					stage: "checks",
					status: "JUDGED",
					grade: "F",
					verdict: "STOP",
					elapsedMs: 1600,
					evidence: {
						resultSha: "a".repeat(40),
						recordFile: "attempt.json",
					},
				},
			],
		};

		expect(() => parseConfirmationRepRecord(JSON.stringify(record))).toThrow(
			"Successful reps require passing stage and final outcomes",
		);
	});

	it("rejects a trajectory count that differs from worker turns", () => {
		const record = {
			...completeRepRecord(),
			workerTrajectorySteps: 4,
		};

		expect(() => parseConfirmationRepRecord(JSON.stringify(record))).toThrow(
			"Worker trajectory steps must equal provider-reported worker turns",
		);
	});

	it("omits ephemeral v2 session paths and refuses worktree claims", () => {
		const record = sessionRepRecord();

		expect(parseConfirmationRepRecord(JSON.stringify(record))).toEqual(record);
		expect(() =>
			parseConfirmationRepRecord(
				JSON.stringify({ ...record, worktreePath: "/tmp/worktree" }),
			),
		).toThrow();
		expect(() =>
			parseConfirmationRepRecord(
				JSON.stringify({ ...record, attemptDirectory: "/tmp/attempt" }),
			),
		).toThrow();
	});

	it.each([
		{ grade: "A", verdict: "STOP" },
		{ grade: "F", verdict: "CONTINUE" },
	])("refuses the impossible judged pair $grade/$verdict", (judgment) => {
		const record = sessionRepRecord();

		expect(() =>
			parseConfirmationRepRecord(
				JSON.stringify({
					...record,
					outcome: "UNSUCCESSFUL",
					stages: [{ ...record.stages[0], ...judgment }],
				}),
			),
		).toThrow();
	});

	it("refuses an unsuccessful v2 session rep with passing complete evidence", () => {
		const record = sessionRepRecord();

		expect(() =>
			parseConfirmationRepRecord(
				JSON.stringify({ ...record, outcome: "UNSUCCESSFUL" }),
			),
		).toThrow("Passing checks with complete metrics require a successful rep");
	});
});

describe(parseConfirmationGroupRecord.name, () => {
	function groupRecord(): ConfirmationGroupRecord {
		return {
			schemaVersion: 1,
			caseId: "audit-log",
			groupId: "group-1",
			mode: "stage",
			reps: 2,
			declaredStages: ["build"],
			inputs: {
				lineage: {
					kind: "CHECKPOINT",
					lineage: "checkpoint-1",
					targetSha: "a".repeat(40),
				},
				files: [
					{
						kind: "corpus",
						path: "inputs/corpus/build/SKILL.md",
						sha256: "b".repeat(64),
					},
					{
						kind: "rubric",
						path: "inputs/rubrics/build.json",
						sha256: "c".repeat(64),
					},
				],
				model: "sonnet",
				effort: "high",
				judgeModel: "opus",
				judgeEffort: "high",
				sessionBudgetUsd: 5,
				pipelinePath: "pipelines/default.json",
			},
			projectedCost: {
				reps: 2,
				perRepMaximumUsd: 20,
				totalMaximumUsd: 40,
			},
			approval: { method: "yes", approved: true },
			repRecords: [
				{
					repId: "group-1-rep-1",
					ordinal: 1,
					path: "reps/group-1-rep-1/rep.json",
				},
				{
					repId: "group-1-rep-2",
					ordinal: 2,
					path: "reps/group-1-rep-2/rep.json",
				},
			],
			reportFile: "report.json",
			makespanMs: 300,
		};
	}

	function sessionGroupRecord(): SessionConfirmationGroupRecord {
		return {
			schemaVersion: 2 as const,
			caseId: "smoke",
			groupId: "session-group",
			mode: "session" as const,
			reps: 2,
			declaredStages: ["checks"] as const,
			inputs: {
				lineage: { kind: "SESSION" as const, lineage: "lineage-1" },
				files: [
					{
						kind: "case" as const,
						path: "inputs/case.json",
						sha256: "a".repeat(64),
					},
				],
				model: "sonnet",
				sessionBudgetUsd: 0.2,
			},
			projectedCost: {
				reps: 2,
				perRepMaximumUsd: 0.2,
				preflightMaximumUsd: 0.1,
				totalMaximumUsd: 0.5,
			},
			preflight: {
				status: "MISSING" as const,
				missing: "preflight call metrics",
			},
			approval: { method: "yes" as const, approved: true as const },
			repRecords: [1, 2].map((ordinal) => ({
				repId: `session-group-rep-${ordinal}`,
				ordinal,
				path: `reps/session-group-rep-${ordinal}/rep.json`,
			})),
			reportFile: "report.json",
			makespanMs: 100,
		};
	}

	it("accepts one frozen group envelope with every rep reference", () => {
		const record = groupRecord();

		expect(parseConfirmationGroupRecord(JSON.stringify(record))).toEqual(
			record,
		);
	});

	it.each(["interactive", "yes", "browser"] as const)(
		"accepts a group approved by the %s method",
		(method) => {
			const pipeline = {
				...groupRecord(),
				approval: { method, approved: true },
			};
			const session = {
				...sessionGroupRecord(),
				approval: { method, approved: true },
			};

			expect(
				parseConfirmationGroupRecord(JSON.stringify(pipeline)).approval.method,
			).toBe(method);
			expect(
				parseConfirmationGroupRecord(JSON.stringify(session)).approval.method,
			).toBe(method);
		},
	);

	it("reads a group record without a caseId as the audit-log case", () => {
		const { caseId: _caseId, ...legacy } = groupRecord();

		expect(parseConfirmationGroupRecord(JSON.stringify(legacy)).caseId).toBe(
			"audit-log",
		);
	});

	it("keeps schema version 1 while carrying the case", () => {
		expect(groupRecord().schemaVersion).toBe(1);
	});

	it("accepts a session group at schema version 1, with checks as its one stage", () => {
		const record: ConfirmationGroupRecord = {
			...groupRecord(),
			caseId: "smoke",
			mode: "session",
			declaredStages: ["checks"],
			projectedCost: { reps: 2, perRepMaximumUsd: 0.2, totalMaximumUsd: 0.4 },
		};

		expect(parseConfirmationGroupRecord(JSON.stringify(record))).toEqual(
			record,
		);
	});

	it("keeps a v1 stage group parsing unchanged beside the session mode", () => {
		const record = groupRecord();

		expect(parseConfirmationGroupRecord(JSON.stringify(record))).toEqual(
			record,
		);
	});

	it("rejects a group missing a requested rep record", () => {
		const record = {
			...groupRecord(),
			repRecords: groupRecord().repRecords.slice(1),
		};

		expect(() => parseConfirmationGroupRecord(JSON.stringify(record))).toThrow(
			"Group must reference every requested rep exactly once",
		);
	});

	it("rejects a v2 session projection whose total omits part of the command", () => {
		const record = sessionGroupRecord();

		expect(() =>
			parseConfirmationGroupRecord(
				JSON.stringify({
					...record,
					projectedCost: { ...record.projectedCost, totalMaximumUsd: 0.4 },
				}),
			),
		).toThrow(
			"Session projected total must equal preflight plus every rep maximum",
		);
	});
});
