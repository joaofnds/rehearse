import { afterEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { RecordedStageEvidence } from "#benchmark/contracts";
import { harnessResult } from "#benchmark/test-support";
import type { EvidenceRequest, EvidenceSource } from "./evidence-source";
import { EvidenceSourceError, readEvidenceSource } from "./evidence-source";

const RUN = "2026-09-27T00-00-00.000Z";
const DIFF = [
	"--- a/src/app.ts",
	"+++ b/src/app.ts",
	"@@ -1 +1,2 @@",
	" export {};",
	"+export const audit = true;",
].join("\n");

function evidence(
	source: RecordedStageEvidence["source"],
	path: string,
	fields: Pick<RecordedStageEvidence, "quote" | "locator"> = {},
): RecordedStageEvidence {
	return { source, path, claim: `${source} claim`, ...fields };
}

const STAGE_RECORD = {
	stage: "build",
	grade: {
		grade: "B",
		verdict: "CONTINUE",
		hardBlockers: [
			{
				id: "unfinished-delivery",
				status: "PASS",
				evidence: [
					evidence("local-checks", "local-checks", {
						locator: { kind: "harness", result: "localChecks", recorded: true },
					}),
				],
			},
		],
		requirements: [
			{
				id: "scope",
				status: "PASS",
				evidence: [
					evidence("diff", "src/app.ts", {
						quote: "export {};\nexport const audit = true;",
						locator: {
							kind: "hunk",
							file: "src/app.ts",
							hunk: "@@ -1 +1,2 @@",
							occurrences: 1,
						},
					}),
					evidence("task", "backlog-seed.md", {
						quote: "keep  every change",
						locator: {
							kind: "lines",
							file: "backlog-seed.md",
							startLine: 2,
							endLine: 2,
							occurrences: 1,
						},
					}),
					evidence("baseline-context", "../../etc/passwd", {
						quote: "recorded bytes",
						locator: {
							kind: "lines",
							file: "../../etc/passwd",
							startLine: 1,
							endLine: 1,
							occurrences: 1,
						},
					}),
				],
			},
		],
		dimensions: [
			{
				id: "clarity",
				grade: "B",
				evidence: [
					evidence("transcript", "transcript", {
						quote: "keep deletes",
						locator: {
							kind: "exchange",
							exchange: 1,
							field: "productOwnerAnswer",
							start: 5,
							end: 17,
						},
					}),
					evidence("commit-subjects", "commit-subjects", {
						quote: "persistence",
						locator: { kind: "commit-subject", index: 1 },
					}),
					evidence("commit-subjects", "commit-subjects", {
						locator: { kind: "absent" },
					}),
					evidence("task", "backlog-seed.md"),
				],
			},
		],
	},
	input: {
		stage: "build",
		kind: "delivery",
		task: "# Task\nWe keep every change.\n",
		productBrief: "Brief",
		instructions: "Instructions",
		baselineContext: [
			{ path: "../../etc/passwd", content: "recorded bytes\n" },
		],
		taskState: "State",
		transcript: {
			stage: "build",
			sessionId: "session",
			costUsd: 1,
			providerCalls: [],
			exchanges: [
				{ agent: { status: "QUESTION", message: "Which table?" } },
				{
					agent: { status: "QUESTION", message: "Keep deletes?" },
					productOwnerAnswer: "Yes, keep deletes forever.",
				},
			],
		},
		priorArtifacts: [],
		diff: DIFF,
		changedPaths: ["src/app.ts"],
		commitSubjects: ["feat: add entity", "feat: add persistence layer"],
		localChecks: harnessResult("PASS", "all green"),
	},
};

const FINAL_RECORD = {
	caseId: "audit-log",
	status: "AWAITING_HUMAN_REVIEW",
	grade: {
		verdict: "PASS",
		summary: "complete",
		requirements: [
			{
				id: "tests",
				status: "PASS",
				evidence: [
					evidence("diff", "src/app.ts", {
						quote: "+export const audit = true;",
						locator: {
							kind: "hunk",
							file: "src/app.ts",
							hunk: "@@ -1 +1,2 @@",
							occurrences: 1,
						},
					}),
				],
			},
			{
				id: "check-integrity",
				status: "PASS",
				evidence: [
					evidence("local-checks", "harness", {
						locator: {
							kind: "harness",
							result: "checkIntegrity",
							recorded: true,
						},
					}),
				],
			},
		],
	},
	diff: DIFF,
	baselineContext: [],
	checkIntegrity: harnessResult("PASS", "checks match"),
	localChecks: harnessResult("PASS", "all green"),
};

describe(readEvidenceSource.name, () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
		);
	});

	async function recordedRuns(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-evidence-"));
		roots.push(root);
		await writeFile(
			join(root, `${RUN}.build.json`),
			JSON.stringify(STAGE_RECORD),
		);
		await writeFile(join(root, `${RUN}.json`), JSON.stringify(FINAL_RECORD));

		return root;
	}

	async function stageSource(
		section: string,
		item: string,
		index: string,
	): Promise<EvidenceSource> {
		return readEvidenceSource({
			runsDirectory: await recordedRuns(),
			run: RUN,
			judge: { kind: "stage", stage: "build" },
			section,
			item,
			index,
		});
	}

	function marked(source: EvidenceSource): string | undefined {
		return source.view.kind === "text" && source.view.span !== undefined
			? source.view.text.slice(source.view.span.start, source.view.span.end)
			: undefined;
	}

	it("returns the recorded diff with the quoted span marked and names the record file", async () => {
		const source = await stageSource("requirements", "scope", "0");

		expect(source).toMatchObject({
			source: "diff",
			path: "src/app.ts",
			claim: "diff claim",
			quote: "export {};\nexport const audit = true;",
			view: { kind: "text", label: "src/app.ts @@ -1 +1,2 @@", text: DIFF },
		});
		expect(source.record.endsWith(`${RUN}.build.json`)).toBe(true);
		expect(marked(source)).toBe("export {};\n+export const audit = true;");
	});

	it("returns the recorded text file a lines locator names, with the span marked", async () => {
		const source = await stageSource("requirements", "scope", "1");

		expect(source.view).toMatchObject({
			kind: "text",
			label: "backlog-seed.md",
			text: "# Task\nWe keep every change.\n",
		});
		expect(marked(source)).toBe("keep every change");
	});

	it("returns only the record's own bytes for an evidence path that climbs out of the records", async () => {
		const source = await stageSource("requirements", "scope", "2");

		expect(source.view).toEqual({
			kind: "text",
			label: "../../etc/passwd",
			text: "recorded bytes\n",
			span: { start: 0, end: 14 },
		});
	});

	it("returns the exchange field a transcript locator names", async () => {
		const source = await stageSource("dimensions", "clarity", "0");

		expect(source.view).toMatchObject({
			kind: "text",
			label: "exchange 2 productOwnerAnswer",
			text: "Yes, keep deletes forever.",
		});
		expect(marked(source)).toBe("keep deletes");
	});

	it("returns the commit subjects with the cited subject's span marked", async () => {
		const source = await stageSource("dimensions", "clarity", "1");

		expect(source.view).toMatchObject({
			kind: "text",
			label: "commit subject 2",
			text: "feat: add entity\nfeat: add persistence layer",
		});
		expect(marked(source)).toBe("persistence");
	});

	it("returns the harness result a harness locator names", async () => {
		const source = await stageSource(
			"hardBlockers",
			"unfinished-delivery",
			"0",
		);

		expect(source.view).toEqual({
			kind: "harness",
			result: "localChecks",
			recorded: true,
			value: harnessResult("PASS", "all green"),
		});
	});

	it("says a cited source is absent", async () => {
		const source = await stageSource("dimensions", "clarity", "2");

		expect(source.view).toEqual({ kind: "absent" });
	});

	it("says an item was recorded before quoted spans", async () => {
		const source = await stageSource("dimensions", "clarity", "3");

		expect(source.view).toEqual({ kind: "before-quoted-spans" });
	});

	it("returns the final judge's evidence from the run record", async () => {
		const runsDirectory = await recordedRuns();
		const request = {
			runsDirectory,
			run: RUN,
			judge: { kind: "final" },
			section: "requirements",
		} as const;

		const quoted = await readEvidenceSource({
			...request,
			item: "tests",
			index: "0",
		});
		const harness = await readEvidenceSource({
			...request,
			item: "check-integrity",
			index: "0",
		});

		expect(quoted.record.endsWith(`${RUN}.json`)).toBe(true);
		expect(marked(quoted)).toBe("+export const audit = true;");
		expect(harness.view).toEqual({
			kind: "harness",
			result: "checkIntegrity",
			recorded: true,
			value: harnessResult("PASS", "checks match"),
		});
	});

	it.each<[string, Partial<EvidenceRequest>]>([
		["an item the grade lacks", { item: "missing" }],
		["an evidence index past the item's evidence", { index: "3" }],
		["an index that is not a number", { index: "first" }],
		["a section a stage grade does not have", { section: "summary" }],
		[
			"a stage the run did not record",
			{ judge: { kind: "stage", stage: "ship" } },
		],
		["a stage named ..", { judge: { kind: "stage", stage: ".." } }],
		["a stage holding a slash", { judge: { kind: "stage", stage: "build/x" } }],
	])("finds nothing for %s", async (_label, change) => {
		const request: EvidenceRequest = {
			runsDirectory: await recordedRuns(),
			run: RUN,
			judge: { kind: "stage", stage: "build" },
			section: "requirements",
			item: "scope",
			index: "0",
			...change,
		};

		expect(readEvidenceSource(request)).rejects.toMatchObject({
			name: EvidenceSourceError.name,
			kind: "not-found",
		});
	});

	it("refuses a run id with a traversing segment", async () => {
		expect(
			readEvidenceSource({
				runsDirectory: await recordedRuns(),
				run: "../outside",
				judge: { kind: "final" },
				section: "requirements",
				item: "tests",
				index: "0",
			}),
		).rejects.toMatchObject({
			name: EvidenceSourceError.name,
			kind: "refused",
		});
	});
});
