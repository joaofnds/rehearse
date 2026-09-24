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
import { recordsOnDisk } from "./short-id-backfill";

let runsDirectory: string;
let fixture: RecordedRunsFixture;

beforeEach(async () => {
	runsDirectory = await mkdtemp(join(tmpdir(), "rehearse-backfill-"));
	fixture = new RecordedRunsFixture(runsDirectory);
});

afterEach(async () => {
	await rm(runsDirectory, { recursive: true, force: true });
});

function transcript(...timestamps: readonly string[]): string {
	return timestamps
		.map((timestamp) => `${JSON.stringify({ type: "user", timestamp })}\n`)
		.join("");
}

async function recordedIn(caseId: string): Promise<readonly unknown[]> {
	const found = await recordsOnDisk(runsDirectory, caseId);

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
			const record: unknown = JSON.parse(await Bun.file(resumed).text());
			await Bun.write(
				resumed,
				JSON.stringify({
					...z.record(z.string(), z.unknown()).parse(record),
					transcriptDiagnostics: {
						state: "unavailable",
						prefixLinesExcluded: 1,
					},
				}),
			);
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
