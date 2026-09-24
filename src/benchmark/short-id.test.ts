import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RecordedRunsFixture } from "./run-records-test-support";
import {
	bindReplay,
	claimShortId,
	formatShortId,
	readShortIds,
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
