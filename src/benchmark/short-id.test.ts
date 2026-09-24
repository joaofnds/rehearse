import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RecordedRunsFixture } from "./run-records-test-support";
import { claimShortId, formatShortId, readShortIds } from "./short-id";

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
});

describe(formatShortId.name, () => {
	it("spells a run's number after its case, unpadded", () => {
		expect(formatShortId({ caseId: CASE_ID, kind: "run", number: 12 })).toBe(
			"audit-log/r12",
		);
	});
});
