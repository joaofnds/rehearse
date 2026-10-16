import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import { expectHistoryError } from "./evidence-test-support";
import { readGroupFinalAssessment } from "./group-final-assessment";

const roots: string[] = [];
afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
	);
});
async function fixture(recordsName?: string): Promise<{
	readonly runsDirectory: string;
	readonly groupId: string;
	readonly repId: string;
	readonly finalFile: string;
}> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-group-final-"));
	roots.push(root);
	const runsDirectory =
		recordsName === undefined ? root : join(root, recordsName);
	await mkdir(runsDirectory, { recursive: true });
	const records = new RecordedRunsFixture(runsDirectory);
	const groupId = "group-final";
	await records.writePipelineGroup(groupId, [
		{ discussion: "pass", build: "pass", final: "fail" },
		{ discussion: "pass", build: "pass", final: "pass" },
	]);
	const repId = `${groupId}-rep-1`;
	return {
		runsDirectory,
		groupId,
		repId,
		finalFile: confirmationGroupPaths(runsDirectory, groupId).rep(repId)
			.finalFile,
	};
}
const finalRecord = {
	grade: {
		verdict: "FAIL",
		summary: "The response omitted hasMore.",
		requirements: [
			{
				id: "response-contract",
				status: "FAIL",
				evidence: [
					{
						source: "diff",
						path: "src/a.ts",
						claim: "hasMore is absent.",
						quote: "return {items: []}",
						locator: {
							kind: "lines",
							file: "src/a.ts",
							startLine: 12,
							endLine: 12,
							occurrences: 1,
						},
					},
				],
			},
		],
	},
};
describe(readGroupFinalAssessment.name, () => {
	it("reads independently judged requirements with retained quotes and source locations", async () => {
		const saved = await fixture();
		await Bun.write(saved.finalFile, JSON.stringify(finalRecord));
		const result = await readGroupFinalAssessment(saved);
		expect(result).toEqual({
			state: "available",
			summary: finalRecord.grade.summary,
			requirements: [
				{
					id: "response-contract",
					status: "FAIL",
					evidence: [
						{
							source: "diff",
							path: "src/a.ts",
							claim: "hasMore is absent.",
							quote: "return {items: []}",
							place: "src/a.ts:12",
						},
					],
				},
			],
		});
	});
	it("labels older verdict-only records as missing evidence", async () => {
		const saved = await fixture();
		const result = await readGroupFinalAssessment(saved);
		expect(result.state).toBe("unavailable");
		if (result.state === "unavailable") {
			expect(result.reason).toContain("final verdict only");
		}
	});
	it("does not borrow an assessment with a different verdict", async () => {
		const saved = await fixture();
		await Bun.write(
			saved.finalFile,
			JSON.stringify({
				...finalRecord,
				grade: { ...finalRecord.grade, verdict: "PASS" },
			}),
		);
		expect(await readGroupFinalAssessment(saved)).toMatchObject({
			state: "unavailable",
		});
	});
	it("handles malformed final JSON without substituting a failed grade", async () => {
		const saved = await fixture();
		await Bun.write(saved.finalFile, "{broken");
		const result = await readGroupFinalAssessment(saved);
		expect(result.state).toBe("unavailable");
		if (result.state === "unavailable") {
			expect(result.reason).toContain("not readable JSON");
		}
	});
	it("refuses an evidence symlink even inside the records directory", async () => {
		const saved = await fixture();
		const other = join(saved.runsDirectory, "other.json");
		await Bun.write(other, JSON.stringify(finalRecord));
		await symlink(other, saved.finalFile);
		await expectHistoryError(readGroupFinalAssessment(saved), "refused");
		await unlink(saved.finalFile);
	});
	it("reads an owned final assessment under a records directory named confirmations", async () => {
		const saved = await fixture("confirmations");
		await Bun.write(saved.finalFile, JSON.stringify(finalRecord));

		const result = await readGroupFinalAssessment(saved);

		expect(result).toMatchObject({
			state: "available",
			summary: finalRecord.grade.summary,
		});
	});
});
