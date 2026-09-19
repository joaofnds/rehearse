import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TestResources } from "#benchmark/test-support";
import {
	gradeStateEvidence,
	parseStateScorerOutput,
} from "#benchmark/session-state-check";

const resources = TestResources.forEachTest();

async function evidenceDirectory(): Promise<string> {
	const path = await mkdtemp(join(tmpdir(), "rehearse-state-grade-"));
	resources.track(path);
	await Bun.write(join(path, "left-behind.txt"), "by the session\n");

	return path;
}

describe(parseStateScorerOutput.name, () => {
	const declared = ["cards-archived", "tree-clean"] as const;

	it("pairs each declared outcome with the result the scorer named", () => {
		const parsed = parseStateScorerOutput(
			`{"results":[{"name":"tree-clean","status":"FAIL","detail":"2 untracked"},{"name":"cards-archived","status":"PASS","detail":"3 archived"}]}`,
			declared,
		);

		expect(parsed).toEqual({
			kind: "results",
			results: [
				{ name: "cards-archived", status: "PASS", detail: "3 archived" },
				{ name: "tree-clean", status: "FAIL", detail: "2 untracked" },
			],
		});
	});

	it("reads stdout that is not JSON as a grading error", () => {
		expect(parseStateScorerOutput("not json", declared)).toMatchObject({
			kind: "error",
		});
	});

	it("reads a result the schema rejects as a grading error", () => {
		expect(
			parseStateScorerOutput(
				`{"results":[{"name":"tree-clean","status":"MAYBE","detail":"x"}]}`,
				declared,
			),
		).toMatchObject({ kind: "error" });
	});

	it("reads a declared outcome the scorer omitted as a grading error", () => {
		const parsed = parseStateScorerOutput(
			`{"results":[{"name":"tree-clean","status":"PASS","detail":"clean"}]}`,
			declared,
		);

		expect(parsed).toMatchObject({ kind: "error" });
		expect(parsed.kind === "error" ? parsed.detail : "").toContain(
			"cards-archived",
		);
	});
});

describe(gradeStateEvidence.name, () => {
	const outcomes = ["left-behind"] as const;

	it("records the results a scorer reported over the evidence", async () => {
		const graded = await gradeStateEvidence({
			evidenceDirectory: await evidenceDirectory(),
			restoreDirectory: await mkdtemp(
				join(tmpdir(), "rehearse-state-graderoot-"),
			),
			scorerSource: undefined,
			command: [
				"sh",
				"-c",
				'printf \'{"results":[{"name":"left-behind","status":"%s","detail":"%s"}]}\' "$(test -f left-behind.txt && echo PASS || echo FAIL)" "read from the restore"',
			],
			outcomes,
		});

		expect(graded).toEqual({
			kind: "results",
			results: [
				{
					name: "left-behind",
					status: "PASS",
					detail: "read from the restore",
				},
			],
		});
	});

	it("reads a scorer that cannot be run at all as a grading error", async () => {
		const graded = await gradeStateEvidence({
			evidenceDirectory: await evidenceDirectory(),
			restoreDirectory: await mkdtemp(
				join(tmpdir(), "rehearse-state-graderoot-"),
			),
			scorerSource: undefined,
			command: ["/nonexistent/scorer-binary"],
			outcomes,
		});

		expect(graded).toMatchObject({ kind: "error" });
		expect(graded.kind === "error" ? graded.detail : "").toContain(
			"/nonexistent/scorer-binary",
		);
	});

	it("names a scorer that outlived its deadline as timed out", async () => {
		const graded = await gradeStateEvidence({
			evidenceDirectory: await evidenceDirectory(),
			restoreDirectory: await mkdtemp(
				join(tmpdir(), "rehearse-state-graderoot-"),
			),
			scorerSource: undefined,
			command: ["sh", "-c", "sleep 5"],
			outcomes,
			timeoutMs: 200,
		});

		expect(graded).toMatchObject({ kind: "error" });
		expect(graded.kind === "error" ? graded.detail : "").toContain(
			"timed out after 200ms",
		);
	});

	it("reads a scorer that exits non-zero as a grading error", async () => {
		const graded = await gradeStateEvidence({
			evidenceDirectory: await evidenceDirectory(),
			restoreDirectory: await mkdtemp(
				join(tmpdir(), "rehearse-state-graderoot-"),
			),
			scorerSource: undefined,
			command: ["sh", "-c", "echo broken >&2; exit 3"],
			outcomes,
		});

		expect(graded).toMatchObject({ kind: "error" });
		expect(graded.kind === "error" ? graded.detail : "").toContain("3");
	});
});
