import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { failureOf } from "#cli/cli-test-support";
import { RecordedRunsFixture } from "./run-records-test-support";
import {
	bindReplay,
	claimShortId,
	checkpointStageAt,
	checkpointStageNumber,
	formatShortId,
	readShortIds,
	resolveShortId,
} from "./short-id";

const CASE_ID = "audit-log";

let runsDirectory: string;

beforeEach(async () => {
	runsDirectory = await mkdtemp(join(tmpdir(), "rehearse-short-id-"));
});

afterEach(async () => {
	await rm(runsDirectory, { recursive: true, force: true });
});

async function claimInProcesses(
	processes: number,
	claimsEach: number,
): Promise<void> {
	const script = `
		import { claimShortId } from ${JSON.stringify(join(import.meta.dir, "short-id.ts"))};
		for (let i = 0; i < ${String(claimsEach)}; i++) {
			await claimShortId(${JSON.stringify(runsDirectory)}, ${JSON.stringify(CASE_ID)}, {
				kind: "run",
				run: \`claimed-\${process.pid}-\${i}\`,
			});
		}
	`;
	const children = Array.from({ length: processes }, () =>
		Bun.spawn([process.execPath, "-e", script], { stderr: "inherit" }),
	);

	const exits = await Promise.all(children.map((child) => child.exited));

	expect(exits).toEqual(Array.from({ length: processes }, () => 0));
}

describe(claimShortId.name, () => {
	it("numbers the case's records oldest first and gives every concurrent claim its own number above them", async () => {
		const fixture = new RecordedRunsFixture(runsDirectory);
		await fixture.writePipelineRun("2026-09-03T00-00-00.000Z", CASE_ID);
		await fixture.writePipelineRun("2026-09-01T00-00-00.000Z", CASE_ID);
		await fixture.writePipelineRun("2026-09-02T00-00-00.000Z", CASE_ID);

		await claimInProcesses(4, 10);

		const named = await readShortIds(runsDirectory, CASE_ID);
		expect(named.slice(0, 3)).toEqual([
			{
				shortId: "audit-log/r1",
				record: { kind: "run", run: "2026-09-01T00-00-00.000Z" },
			},
			{
				shortId: "audit-log/r2",
				record: { kind: "run", run: "2026-09-02T00-00-00.000Z" },
			},
			{
				shortId: "audit-log/r3",
				record: { kind: "run", run: "2026-09-03T00-00-00.000Z" },
			},
		]);
		expect(named.slice(3).map(({ shortId }) => shortId)).toEqual(
			[...Array.from({ length: 40 }).keys()].map(
				(index) => `audit-log/r${String(index + 4)}`,
			),
		);
	});
	it("gives a run and a confirmation group of one case different numbers from one sequence", async () => {
		const run = await claimShortId(runsDirectory, CASE_ID, {
			kind: "run",
			run: "2026-09-24T00-00-00.000Z",
		});
		const group = await claimShortId(runsDirectory, CASE_ID, {
			kind: "group",
			groupId: "group-1",
		});

		expect([formatShortId(run), formatShortId(group)]).toEqual([
			"audit-log/r1",
			"audit-log/g2",
		]);
	});

	it("numbers each case on its own", async () => {
		await claimShortId(runsDirectory, CASE_ID, {
			kind: "run",
			run: "2026-09-24T00-00-00.000Z",
		});

		const other = await claimShortId(runsDirectory, "smoke", {
			kind: "attempt:session",
			caseId: "smoke",
			uuid: "0f6b6f2a-0000-4000-8000-000000000001",
		});

		expect(formatShortId(other)).toBe("smoke/r1");
	});

	describe("when a writer died between creating its claim and writing it", () => {
		it("names nothing by that number and claims above it", async () => {
			await claimShortId(runsDirectory, CASE_ID, {
				kind: "run",
				run: "2026-09-24T00-00-00.000Z",
			});
			await writeFile(
				join(runsDirectory, "short-ids", CASE_ID, "claims", "2"),
				"",
			);

			const next = await claimShortId(runsDirectory, CASE_ID, {
				kind: "run",
				run: "2026-09-24T01-00-00.000Z",
			});

			expect(formatShortId(next)).toBe("audit-log/r3");
			expect(await readShortIds(runsDirectory, CASE_ID)).toEqual([
				{
					shortId: "audit-log/r1",
					record: { kind: "run", run: "2026-09-24T00-00-00.000Z" },
				},
				{
					shortId: "audit-log/r3",
					record: { kind: "run", run: "2026-09-24T01-00-00.000Z" },
				},
			]);
		});
	});
});

describe("when the registry directory holds a file that is not a number", () => {
	it("claims above the numbers and ignores the file", async () => {
		await claimShortId(runsDirectory, CASE_ID, {
			kind: "run",
			run: "2026-09-24T00-00-00.000Z",
		});
		await writeFile(
			join(runsDirectory, "short-ids", CASE_ID, "claims", ".DS_Store"),
			"",
		);

		const next = await claimShortId(runsDirectory, CASE_ID, {
			kind: "run",
			run: "2026-09-24T01-00-00.000Z",
		});

		const entries = await readShortIds(runsDirectory, CASE_ID);
		expect(formatShortId(next)).toBe("audit-log/r2");
		expect(entries.map(({ shortId }) => shortId)).toEqual([
			"audit-log/r1",
			"audit-log/r2",
		]);
	});
});

describe("when a claim is asked for in a case id that names a path", () => {
	it("refuses it and writes nothing", async () => {
		const records = join(runsDirectory, "records");

		const failure = await failureOf(
			claimShortId(records, "../escaped", {
				kind: "run",
				run: "2026-09-24T00-00-00.000Z",
			}),
		);

		expect(failure.message).toContain("not a case id");
		expect(await readdir(runsDirectory)).toEqual([]);
	});
});

describe(bindReplay.name, () => {
	it("names the replay's record by the number its claim took", async () => {
		const claimed = await claimShortId(runsDirectory, CASE_ID, {
			kind: "replay",
			run: "2026-09-24T00-00-00.000Z",
			stage: "build",
		});

		await bindReplay(runsDirectory, claimed, {
			lineage: "lineage-build",
			timestamp: "2026-09-24T02-00-00.000Z",
		});

		expect(await readShortIds(runsDirectory, CASE_ID)).toEqual([
			{
				shortId: "audit-log/r1",
				record: {
					kind: "attempt:stage",
					lineage: "lineage-build",
					timestamp: "2026-09-24T02-00-00.000Z",
				},
			},
		]);
	});

	describe("when the replay failed before it was bound", () => {
		it("names nothing by its number", async () => {
			await claimShortId(runsDirectory, CASE_ID, {
				kind: "replay",
				run: "2026-09-24T00-00-00.000Z",
				stage: "build",
			});

			expect(await readShortIds(runsDirectory, CASE_ID)).toEqual([]);
		});
	});
});

describe(formatShortId.name, () => {
	it("spells a run's number after its case, unpadded", () => {
		expect(formatShortId({ caseId: CASE_ID, kind: "run", number: 12 })).toBe(
			"audit-log/r12",
		);
	});
});

describe(resolveShortId.name, () => {
	it("names the record its number was claimed for", async () => {
		const claimed = await claimShortId(runsDirectory, CASE_ID, {
			kind: "group",
			groupId: "group-1",
		});

		expect(await resolveShortId(runsDirectory, claimed)).toEqual({
			kind: "group",
			groupId: "group-1",
		});
	});

	describe("when the letter does not match the kind claimed", () => {
		it("names nothing", async () => {
			const claimed = await claimShortId(runsDirectory, CASE_ID, {
				kind: "group",
				groupId: "group-1",
			});

			expect(
				await resolveShortId(runsDirectory, { ...claimed, kind: "run" }),
			).toBeUndefined();
		});
	});

	describe("when a claim names a record by a path", () => {
		it("names nothing", async () => {
			const claims = join(runsDirectory, "short-ids", CASE_ID, "claims");
			await claimShortId(runsDirectory, CASE_ID, {
				kind: "group",
				groupId: "group-1",
			});
			await writeFile(
				join(claims, "2"),
				JSON.stringify({ kind: "group", groupId: "../../outside" }),
			);

			expect(
				await resolveShortId(runsDirectory, {
					caseId: CASE_ID,
					kind: "group",
					number: 2,
				}),
			).toBeUndefined();
		});
	});

	describe("when no registry exists for the case", () => {
		it("names nothing and creates none", async () => {
			expect(
				await resolveShortId(runsDirectory, {
					caseId: CASE_ID,
					kind: "run",
					number: 1,
				}),
			).toBeUndefined();
			expect(await readdir(runsDirectory)).toEqual([]);
		});
	});
});

describe("checkpoint labels", () => {
	const stages = ["discuss", "build"];

	it("numbers the setup checkpoint 0 and each stage by its place in the pipeline", () => {
		expect(
			["initial", "discuss", "build"].map((stage) =>
				checkpointStageNumber(stages, stage),
			),
		).toEqual([0, 1, 2]);
		expect(
			[0, 1, 2].map((number) => checkpointStageAt(stages, number)),
		).toEqual(["initial", "discuss", "build"]);
	});

	it("names no label for a stage outside the pipeline", () => {
		expect(checkpointStageNumber(stages, "review")).toBeUndefined();
		expect(checkpointStageAt(stages, 3)).toBeUndefined();
	});
});
