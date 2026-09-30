import { describe, expect, it } from "bun:test";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { UNREAD_RUN_FIGURES } from "#client/test-support/run-figures";
import {
	announcements,
	clockReading,
	gradesSoFar,
	runsInFlight,
	stepOf,
} from "./run-in-flight";

type HistoryRow = RunHistoryResponse["rows"][number];
type PipelineRow = Extract<HistoryRow, { readonly kind: "run" }>;
type StageGrade = Extract<
	PipelineRow["stageGrades"],
	{ readonly state: "available" }
>["grades"][number];

const RUN = "2026-09-30T10-00-00.000Z";

function graded(stage: string, letter: string, verdict = "PASS"): StageGrade {
	return {
		stage,
		status: "graded",
		grade: { state: "available", letter, verdict },
	};
}

function notYet(stage: string): StageGrade {
	return {
		stage,
		status: "no-record",
		grade: { state: "unavailable", reasons: ["the stage wrote no record"] },
	};
}

function runRow(props: {
	readonly run?: string;
	readonly status?: string;
	readonly stage?: string;
	readonly grades?: readonly StageGrade[];
	readonly runSpentUsd?: number;
	readonly ceilingUsd?: number;
}): PipelineRow {
	const status = props.status ?? "RUNNING";

	return {
		kind: "run",
		...UNREAD_RUN_FIGURES,
		stageGrades:
			props.grades === undefined
				? UNREAD_RUN_FIGURES.stageGrades
				: { state: "available", grades: props.grades },
		launchId: undefined,
		shortId: "r-0148",
		checkpoints: [],
		links: [],
		run: props.run ?? RUN,
		caseId: "audit-log",
		status,
		stage: undefined,
		grade: undefined,
		corpusVersion: undefined,
		corpusChangedDuringRun: false,
		staleness: { state: "unavailable", reasons: ["not read by this test"] },
		progress:
			status === "RUNNING"
				? {
						state: "running",
						stage: props.stage ?? "build",
						stageState: "session running",
						elapsedMs: 9000,
						measuredAt: "2026-09-30T10:00:09.000Z",
						spentUsd: 0.9,
						spendScope: "this stage's session so far",
						runSpentUsd: props.runSpentUsd,
						ceilingUsd: props.ceilingUsd,
					}
				: { state: "recorded" },
	};
}

describe(runsInFlight.name, () => {
	it("lists the pipeline runs in flight, newest first", () => {
		const older = runRow({ run: "2026-09-30T09-00-00.000Z" });
		const newer = runRow({ run: "2026-09-30T11-00-00.000Z" });

		const listed = runsInFlight([older, runRow({ status: "COMPLETE" }), newer]);

		expect(listed.map(({ run }) => run)).toEqual([newer.run, older.run]);
	});
});

describe(stepOf.name, () => {
	it("places the running stage among the run's stages", () => {
		const row = runRow({
			stage: "build",
			grades: [graded("plan", "B+"), notYet("build"), notYet("review")],
		});

		expect(stepOf(row)).toEqual({ number: 2, of: 3 });
	});

	it("places nothing when the run's stages were not read", () => {
		expect(stepOf(runRow({}))).toBeUndefined();
	});
});

describe(gradesSoFar.name, () => {
	it("lists the letters of the stages graded so far, in pipeline order", () => {
		const row = runRow({
			grades: [graded("plan", "A-"), graded("design", "B+"), notYet("build")],
		});

		expect(gradesSoFar(row)).toEqual(["A-", "B+"]);
	});
});

describe(clockReading.name, () => {
	it.each([
		[0, "00:00"],
		[9999, "00:09"],
		[372_000, "06:12"],
		[3_723_000, "1:02:03"],
	] as const)("reads %d ms as %s", (elapsedMs, reading) => {
		expect(clockReading(elapsedMs)).toBe(reading);
	});
});

describe(announcements.name, () => {
	it("announces a stage accepted since the last reading", () => {
		const before = runRow({ grades: [notYet("plan"), notYet("build")] });
		const after = runRow({
			grades: [graded("plan", "B+"), notYet("build")],
		});

		expect(announcements([before], [after])).toEqual([
			"r-0148 step 1 of 2 accepted: plan B+",
		]);
	});

	it("announces a run that stopped at a stage since the last reading", () => {
		const before = runRow({ grades: [graded("plan", "B+"), notYet("build")] });
		const after = runRow({
			status: "STOPPED:build",
			grades: [graded("plan", "B+"), graded("build", "D", "FAIL")],
		});

		expect(announcements([before], [after])).toEqual([
			"r-0148 stopped at step 2 of 2: build",
		]);
	});

	it("announces the ceiling approached when run spend first reaches 80% of it", () => {
		const before = runRow({ runSpentUsd: 7.9, ceilingUsd: 10 });
		const after = runRow({ runSpentUsd: 8.1, ceilingUsd: 10 });

		expect(announcements([before], [after])).toEqual([
			"r-0148 has spent $8.10 of its $10.00 ceiling",
		]);
	});

	it("announces nothing when only the spend moved below the ceiling's 80%", () => {
		const before = runRow({ runSpentUsd: 1, ceilingUsd: 10 });
		const after = runRow({ runSpentUsd: 2.5, ceilingUsd: 10 });

		expect(announcements([before], [after])).toEqual([]);
	});

	it("announces nothing for spend that stays past the ceiling's 80%", () => {
		const before = runRow({ runSpentUsd: 8.1, ceilingUsd: 10 });
		const after = runRow({ runSpentUsd: 9, ceilingUsd: 10 });

		expect(announcements([before], [after])).toEqual([]);
	});

	it("announces nothing about a run it did not see in flight", () => {
		const after = runRow({
			status: "STOPPED:build",
			grades: [graded("plan", "B+"), graded("build", "D", "FAIL")],
		});

		expect(announcements([], [after])).toEqual([]);
	});
});
