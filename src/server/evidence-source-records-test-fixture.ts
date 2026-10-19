import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { Immutable, RecordedStageEvidence } from "#benchmark/contracts";
import { harnessResult } from "#benchmark/test-support";

import type { EvidenceSource } from "./evidence-source";
import { readEvidenceSource } from "./evidence-source";

const RESOURCE_DRAIN_START_INDEX = 0;

function marked(source: EvidenceSource): string | undefined {
	return source.view.kind === "text" && source.view.span !== undefined
		? source.view.text.slice(source.view.span.start, source.view.span.end)
		: undefined;
}

const RUN = "2026-09-27T00-00-00.000Z";

const DIFF = [
	"--- a/src/app.ts",
	"+++ b/src/app.ts",
	"@@ -1 +1,2 @@",
	" export {};",
	"+export const audit = true;",
].join("\n");

class RecordedEvidenceBuilder {
	public constructor(
		private readonly props: Immutable<Partial<RecordedStageEvidence>> = {},
	) {}

	public build(): RecordedStageEvidence {
		const source = this.props.source ?? "artifact";

		return {
			claim: `${source} claim`,
			path: "delivery.md",
			source,
			...this.props,
		};
	}
}

const STAGE_RECORD = {
	grade: {
		dimensions: [
			{
				evidence: [
					new RecordedEvidenceBuilder({
						locator: {
							end: 17,
							exchange: 1,
							field: "productOwnerAnswer",
							kind: "exchange",
							start: 5,
						},
						path: "transcript",
						quote: "keep deletes",
						source: "transcript",
					}).build(),
					new RecordedEvidenceBuilder({
						locator: { index: 1, kind: "commit-subject" },
						path: "commit-subjects",
						quote: "persistence",
						source: "commit-subjects",
					}).build(),
					new RecordedEvidenceBuilder({
						locator: { kind: "absent" },
						path: "commit-subjects",
						source: "commit-subjects",
					}).build(),
					new RecordedEvidenceBuilder({
						path: "backlog-seed.md",
						source: "task",
					}).build(),
					new RecordedEvidenceBuilder({
						locator: { index: 0, kind: "commit-subject" },
						path: "commit-subjects",
						quote: "add entity\nfeat: add",
						source: "commit-subjects",
					}).build(),
					new RecordedEvidenceBuilder({
						locator: { index: 1, kind: "commit-subject" },
						path: "commit-subjects",
						quote: "feat: add",
						source: "commit-subjects",
					}).build(),
				],
				grade: "B",
				id: "clarity",
			},
		],
		grade: "B",
		hardBlockers: [
			{
				evidence: [
					new RecordedEvidenceBuilder({
						locator: { kind: "harness", recorded: true, result: "localChecks" },
						path: "local-checks",
						source: "local-checks",
					}).build(),
				],
				id: "unfinished-delivery",
				status: "PASS",
			},
		],
		requirements: [
			{
				evidence: [
					new RecordedEvidenceBuilder({
						locator: {
							file: "src/app.ts",
							hunk: "@@ -1 +1,2 @@",
							kind: "hunk",
							occurrences: 1,
						},
						path: "src/app.ts",
						quote: "export {};\nexport const audit = true;",
						source: "diff",
					}).build(),
					new RecordedEvidenceBuilder({
						locator: {
							endLine: 2,
							file: "backlog-seed.md",
							kind: "lines",
							occurrences: 1,
							startLine: 2,
						},
						path: "backlog-seed.md",
						quote: "keep  every change",
						source: "task",
					}).build(),
					new RecordedEvidenceBuilder({
						locator: {
							endLine: 1,
							file: "../../etc/passwd",
							kind: "lines",
							occurrences: 1,
							startLine: 1,
						},
						path: "../../etc/passwd",
						quote: "recorded bytes",
						source: "baseline-context",
					}).build(),
				],
				id: "scope",
				status: "PASS",
			},
		],
		verdict: "CONTINUE",
	},
	input: {
		baselineContext: [
			{ content: "recorded bytes\n", path: "../../etc/passwd" },
		],
		changedPaths: ["src/app.ts"],
		commitSubjects: ["feat: add entity", "feat: add persistence layer"],
		diff: DIFF,
		instructions: "Instructions",
		kind: "delivery",
		localChecks: harnessResult("PASS", "all green"),
		priorArtifacts: [],
		productBrief: "Brief",
		stage: "build",
		task: "# Task\nWe keep every change.\n",
		taskState: "State",
		transcript: {
			costUsd: 1,
			exchanges: [
				{ agent: { message: "Which table?", status: "QUESTION" } },
				{
					agent: { message: "Keep deletes?", status: "QUESTION" },
					productOwnerAnswer: "Yes, keep deletes forever.",
				},
			],
			providerCalls: [],
			sessionId: "session",
			stage: "build",
		},
	},
	stage: "build",
};

const FINAL_RECORD = {
	baselineContext: [],
	caseId: "audit-log",
	checkIntegrity: harnessResult("PASS", "checks match"),
	diff: DIFF,
	grade: {
		requirements: [
			{
				evidence: [
					new RecordedEvidenceBuilder({
						locator: {
							file: "src/app.ts",
							hunk: "@@ -1 +1,2 @@",
							kind: "hunk",
							occurrences: 1,
						},
						path: "src/app.ts",
						quote: "+export const audit = true;",
						source: "diff",
					}).build(),
				],
				id: "tests",
				status: "PASS",
			},
			{
				evidence: [
					new RecordedEvidenceBuilder({
						locator: {
							kind: "harness",
							recorded: true,
							result: "checkIntegrity",
						},
						path: "harness",
						source: "local-checks",
					}).build(),
				],
				id: "check-integrity",
				status: "PASS",
			},
		],
		summary: "complete",
		verdict: "PASS",
	},
	localChecks: harnessResult("PASS", "all green"),
	status: "AWAITING_HUMAN_REVIEW",
};

const roots: string[] = [];

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
	return await readEvidenceSource({
		index,
		item,
		judge: { kind: "stage", stage: "build" },
		run: RUN,
		runsDirectory: await recordedRuns(),
		section,
	});
}

async function clearEvidenceRoots(): Promise<void> {
	await Promise.all(
		roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
			await rm(root, { force: true, recursive: true });
		}),
	);
}

export {
	RecordedEvidenceBuilder,
	RUN,
	DIFF,
	STAGE_RECORD,
	recordedRuns,
	stageSource,
	marked,
	clearEvidenceRoots,
};
