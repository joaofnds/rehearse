import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
	benchmarkRunPaths,
	confirmationGroupPaths,
	sessionAttemptPaths,
} from "./run-layout";
import { RecordedRunsFixture } from "./run-records-test-support";
import { recordedCaseIds, recordsOnDisk } from "./short-id-backfill";

let runsDirectory: string;
let casesDirectory: string;
let fixture: RecordedRunsFixture;

beforeEach(async () => {
	runsDirectory = await mkdtemp(join(tmpdir(), "rehearse-backfill-"));
	casesDirectory = await mkdtemp(join(tmpdir(), "rehearse-backfill-cases-"));
	fixture = new RecordedRunsFixture(runsDirectory);
});

afterEach(async () => {
	await rm(runsDirectory, { recursive: true, force: true });
	await rm(casesDirectory, { recursive: true, force: true });
});

/** A session case whose starting transcript is the first `cut` lines. */
async function declareSmokeCut(cut: number): Promise<void> {
	await Bun.write(
		join(casesDirectory, "smoke", "case.json"),
		JSON.stringify({
			id: "smoke",
			kind: "session",
			title: "Smoke",
			prompt: "Reply with the single word OK.",
			transcript: {
				file: "prefix.jsonl",
				sha256: "a".repeat(64),
				sourceSession: "aaaaaaaa-1111-2222-3333-444444444444",
				cut,
			},
			tools: [],
			corpusFiles: [],
			checks: [{ kind: "tool-calls", max: 0 }],
		}),
	);
}

/** An attempt as written before attempts stored their prefix line count. */
async function withoutStoredPrefix(attemptFile: string): Promise<void> {
	const record: unknown = JSON.parse(await Bun.file(attemptFile).text());
	const { transcriptDiagnostics: _stored, ...rest } = z
		.record(z.string(), z.unknown())
		.parse(record);
	await Bun.write(attemptFile, JSON.stringify(rest));
}

async function withPrefixExcluded(
	attemptFile: string,
	prefixLinesExcluded: number,
): Promise<void> {
	const record: unknown = JSON.parse(await Bun.file(attemptFile).text());
	await Bun.write(
		attemptFile,
		JSON.stringify({
			...z.record(z.string(), z.unknown()).parse(record),
			transcriptDiagnostics: { state: "unavailable", prefixLinesExcluded },
		}),
	);
}

function transcript(...timestamps: readonly string[]): string {
	return timestamps
		.map((timestamp) => `${JSON.stringify({ type: "user", timestamp })}\n`)
		.join("");
}

async function recordedIn(caseId: string): Promise<readonly unknown[]> {
	const found = await recordsOnDisk(runsDirectory, caseId, casesDirectory);

	return found.map(({ record }) => record);
}

describe(recordsOnDisk.name, () => {
	it("lists every run, replay and group of the case oldest first, untimed records last", async () => {
		await fixture.write();
		await fixture.writeStoppedRun();
		await fixture.writeInterruptedRun();
		await fixture.writeSignalAbortedRun();

		expect(await recordedIn("audit-log")).toEqual([
			{ kind: "run", run: fixture.unreplayableRun },
			{ kind: "run", run: fixture.replayableRun },
			{ kind: "attempt:stage", ...fixture.stageAttempt },
			{ kind: "run", run: fixture.stoppedRun },
			{ kind: "run", run: fixture.interruptedRun },
			{ kind: "run", run: fixture.abortedRun },
			{ kind: "group", groupId: fixture.groupId },
		]);
	});

	it("leaves out a run whose history cannot be read", async () => {
		await fixture.writeNoRecordRun();
		await fixture.writeEmptyRunDirectory("any-name-leftover");
		await fixture.writePipelineRun("2026-09-11T00-00-00.000Z", "audit-log");
		await Bun.write(
			benchmarkRunPaths(runsDirectory, "2026-09-11T00-00-00.000Z").artifactFile,
			"{ not json\n",
		);

		expect(await recordedIn("audit-log")).toEqual([]);
	});

	it("leaves out another case's records", async () => {
		await fixture.writePipelineRun("2026-09-11T00-00-00.000Z", "other-case");

		expect(await recordedIn("audit-log")).toEqual([]);
	});

	it("orders session attempts by the first line their transcript recorded", async () => {
		const later = await fixture.writeAttemptAt(
			"aaaaaaaa-0000-4000-8000-000000000001",
			runsDirectory,
			"smoke",
			[],
		);
		const earlier = await fixture.writeAttemptAt(
			"bbbbbbbb-0000-4000-8000-000000000002",
			runsDirectory,
			"smoke",
			[],
		);
		await Bun.write(
			join(later, "..", "transcript.jsonl"),
			transcript("2026-09-08T17:52:28.082Z", "2026-09-08T17:59:00.000Z"),
		);
		await Bun.write(
			join(earlier, "..", "transcript.jsonl"),
			transcript("2026-09-08T09:00:00.000Z"),
		);

		expect(await recordedIn("smoke")).toEqual([
			{
				kind: "attempt:session",
				caseId: "smoke",
				uuid: "bbbbbbbb-0000-4000-8000-000000000002",
			},
			{
				kind: "attempt:session",
				caseId: "smoke",
				uuid: "aaaaaaaa-0000-4000-8000-000000000001",
			},
		]);
	});

	it("orders a session group by its earliest rep", async () => {
		const [firstRep] = await fixture.writeSessionGroup("group-late", 1);
		await fixture.writeSessionGroup("group-early", 1);
		await Bun.write(
			confirmationGroupPaths(runsDirectory, "group-late").rep(firstRep)
				.transcriptFile,
			transcript("2026-09-09T00:00:00.000Z"),
		);
		await Bun.write(
			confirmationGroupPaths(runsDirectory, "group-early").rep(
				"group-early-rep-1",
			).transcriptFile,
			transcript("2026-09-08T00:00:00.000Z"),
		);

		expect(await recordedIn("smoke")).toEqual([
			{ kind: "group", groupId: "group-early" },
			{ kind: "group", groupId: "group-late" },
		]);
	});

	it("dates a group by the earliest of several reps", async () => {
		const reps = await fixture.writeSessionGroup("group-z-two-reps", 2);
		const [single] = await fixture.writeSessionGroup("group-a-one-rep", 1);
		const twoReps = confirmationGroupPaths(runsDirectory, "group-z-two-reps");
		await Bun.write(
			twoReps.rep(reps[0]).transcriptFile,
			transcript("2026-09-10T00:00:00.000Z"),
		);
		await Bun.write(
			twoReps.rep(reps[1]).transcriptFile,
			transcript("2026-09-01T00:00:00.000Z"),
		);
		await Bun.write(
			confirmationGroupPaths(runsDirectory, "group-a-one-rep").rep(single)
				.transcriptFile,
			transcript("2026-09-05T00:00:00.000Z"),
		);

		expect(await recordedIn("smoke")).toEqual([
			{ kind: "group", groupId: "group-z-two-reps" },
			{ kind: "group", groupId: "group-a-one-rep" },
		]);
	});

	it("orders a transcript-dated attempt against a run started in the same hour", async () => {
		const attempt = await fixture.writeAttemptAt(
			"ffffffff-0000-4000-8000-000000000008",
			runsDirectory,
			"smoke",
			[],
		);
		await Bun.write(
			join(attempt, "..", "transcript.jsonl"),
			transcript("2026-09-09T00:30:00.000Z"),
		);
		await fixture.writePipelineRun("2026-09-09T00-45-00.000Z", "smoke");

		expect(await recordedIn("smoke")).toEqual([
			{
				kind: "attempt:session",
				caseId: "smoke",
				uuid: "ffffffff-0000-4000-8000-000000000008",
			},
			{ kind: "run", run: "2026-09-09T00-45-00.000Z" },
		]);
	});

	describe("when a session resumed a transcript a prior session began", () => {
		it("dates the attempt by the first line its own session wrote", async () => {
			const resumed = await fixture.writeAttemptAt(
				"ffffffff-0000-4000-8000-000000000006",
				runsDirectory,
				"smoke",
				[],
			);
			const other = await fixture.writeAttemptAt(
				"99999999-0000-4000-8000-000000000007",
				runsDirectory,
				"smoke",
				[],
			);
			await withPrefixExcluded(resumed, 1);
			await Bun.write(
				join(resumed, "..", "transcript.jsonl"),
				transcript("2026-09-01T00:00:00.000Z", "2026-09-09T00:00:00.000Z"),
			);
			await Bun.write(
				join(other, "..", "transcript.jsonl"),
				transcript("2026-09-05T00:00:00.000Z"),
			);

			expect(await recordedIn("smoke")).toEqual([
				{
					kind: "attempt:session",
					caseId: "smoke",
					uuid: "99999999-0000-4000-8000-000000000007",
				},
				{
					kind: "attempt:session",
					caseId: "smoke",
					uuid: "ffffffff-0000-4000-8000-000000000006",
				},
			]);
		});
	});

	describe("when a session record predates the prefix count it stores", () => {
		it("dates it after the prefix its case declares", async () => {
			await declareSmokeCut(1);
			const resumed = await fixture.writeAttemptAt(
				"00000000-0000-4000-8000-000000000006",
				runsDirectory,
				"smoke",
				[],
			);
			const other = await fixture.writeAttemptAt(
				"11111111-0000-4000-8000-000000000007",
				runsDirectory,
				"smoke",
				[],
			);
			await withoutStoredPrefix(resumed);
			await withoutStoredPrefix(other);
			await Bun.write(
				join(resumed, "..", "transcript.jsonl"),
				transcript("2026-09-01T00:00:00.000Z", "2026-09-09T00:00:00.000Z"),
			);
			await Bun.write(
				join(other, "..", "transcript.jsonl"),
				transcript("2026-09-01T00:00:00.000Z", "2026-09-05T00:00:00.000Z"),
			);

			expect(await recordedIn("smoke")).toEqual([
				{
					kind: "attempt:session",
					caseId: "smoke",
					uuid: "11111111-0000-4000-8000-000000000007",
				},
				{
					kind: "attempt:session",
					caseId: "smoke",
					uuid: "00000000-0000-4000-8000-000000000006",
				},
			]);
		});
	});

	describe("when a group's reps resumed a transcript a prior session began", () => {
		async function groupsResumingOneLine(): Promise<void> {
			for (const [groupId, ownLine] of [
				["group-a-late", "2026-09-09T00:00:00.000Z"],
				["group-b-early", "2026-09-05T00:00:00.000Z"],
			] as const) {
				const [repId] = await fixture.writeSessionGroup(groupId, 1);
				await Bun.write(
					confirmationGroupPaths(runsDirectory, groupId).rep(repId)
						.transcriptFile,
					transcript("2026-09-01T00:00:00.000Z", ownLine),
				);
			}
		}

		it("dates each rep after the prefix its attempt excludes", async () => {
			await groupsResumingOneLine();
			for (const groupId of ["group-a-late", "group-b-early"]) {
				await withPrefixExcluded(
					confirmationGroupPaths(runsDirectory, groupId).rep(`${groupId}-rep-1`)
						.attemptFile,
					1,
				);
			}

			expect(await recordedIn("smoke")).toEqual([
				{ kind: "group", groupId: "group-b-early" },
				{ kind: "group", groupId: "group-a-late" },
			]);
		});

		it("dates a rep that stores no count after the prefix its case declares", async () => {
			await declareSmokeCut(1);
			await groupsResumingOneLine();
			for (const groupId of ["group-a-late", "group-b-early"]) {
				await withoutStoredPrefix(
					confirmationGroupPaths(runsDirectory, groupId).rep(`${groupId}-rep-1`)
						.attemptFile,
				);
			}

			expect(await recordedIn("smoke")).toEqual([
				{ kind: "group", groupId: "group-b-early" },
				{ kind: "group", groupId: "group-a-late" },
			]);
		});
	});

	describe("when a record says nothing of when it ran", () => {
		it("places it after the timed records, a session attempt before a group", async () => {
			await fixture.writeSessionGroup("group-untimed", 1);
			const untimed = await fixture.writeAttemptAt(
				"cccccccc-0000-4000-8000-000000000003",
				runsDirectory,
				"smoke",
				[],
			);
			const timed = await fixture.writeAttemptAt(
				"dddddddd-0000-4000-8000-000000000004",
				runsDirectory,
				"smoke",
				[],
			);
			await Bun.write(
				join(timed, "..", "transcript.jsonl"),
				transcript("2026-09-08T09:00:00.000Z"),
			);

			expect(untimed).toBe(
				sessionAttemptPaths(runsDirectory, {
					caseId: "smoke",
					uuid: "cccccccc-0000-4000-8000-000000000003",
				}).recordFile,
			);
			expect(await recordedIn("smoke")).toEqual([
				{
					kind: "attempt:session",
					caseId: "smoke",
					uuid: "dddddddd-0000-4000-8000-000000000004",
				},
				{
					kind: "attempt:session",
					caseId: "smoke",
					uuid: "cccccccc-0000-4000-8000-000000000003",
				},
				{ kind: "group", groupId: "group-untimed" },
			]);
		});
	});

	describe("when a replay's source run kept no manifest", () => {
		it("leaves the replay out, since nothing names its case", async () => {
			await fixture.writeReplayOf(
				"2026-09-01T00-00-00.000Z",
				"2026-09-03T02-00-00.000Z",
			);

			expect(await recordedIn("audit-log")).toEqual([]);
		});
	});

	describe("when an attempt was half-written", () => {
		it("leaves it out", async () => {
			await fixture.writeUnreadableAttempt(
				"smoke",
				"eeeeeeee-0000-4000-8000-000000000005",
			);

			expect(await recordedIn("smoke")).toEqual([]);
		});
	});
});

describe(recordedCaseIds.name, () => {
	it("names the case of every run, session attempt and group", async () => {
		await fixture.writePipelineRun("2026-09-11T00-00-00.000Z", "audit-log");
		await fixture.writeAttemptAt(
			"aaaaaaaa-0000-4000-8000-000000000001",
			runsDirectory,
			"haiku",
			[],
		);
		await fixture.writeSessionGroup("group-smoke");

		const cases = await recordedCaseIds(runsDirectory);

		expect(cases).toEqual(
			new Set(["audit-log", "haiku", fixture.sessionAttempt.caseId]),
		);
	});

	describe("when run history cannot list a replay's source run", () => {
		it("names the replay's case", async () => {
			await fixture.writeNoRecordRun();
			await fixture.writeReplayOf(
				fixture.noRecordRun,
				"2026-09-05T01-00-00.000Z",
			);

			const cases = await recordedCaseIds(runsDirectory);

			expect(cases).toEqual(new Set(["audit-log"]));
		});
	});

	describe("when a run's or a group's case cannot be read", () => {
		it("names no case for it", async () => {
			await fixture.writeNoRecordRun();
			await fixture.writeUnreadableGroup("group-unreadable");

			const cases = await recordedCaseIds(runsDirectory);

			expect(cases).toEqual(new Set());
		});
	});

	describe("when an attempt was half-written", () => {
		it("names no case for it", async () => {
			await fixture.writeUnreadableAttempt(
				"smoke",
				"eeeeeeee-0000-4000-8000-000000000005",
			);

			const cases = await recordedCaseIds(runsDirectory);

			expect(cases).toEqual(new Set());
		});
	});
});
