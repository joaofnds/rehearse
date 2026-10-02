import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { PASS } from "#benchmark/comparison-test-fixtures";
import { CONTROL_DIR } from "#benchmark/config";
import {
	CASE_ID,
	nothingRunning,
	RecordedRunsFixture,
} from "#benchmark/run-records-test-support";
import { FakeLauncher } from "./launch-test-support";
import { createLaunchApp } from "./launches";

const OLDER_RUN = "2026-09-02T00-00-00.000Z";
const NEWER_RUN = "2026-09-03T00-00-00.000Z";
const SESSION_CASE_ID = "smoke";

const PIPELINE_CASE = {
	id: CASE_ID,
	kind: "pipeline",
	title: "Add an audit log module",
	task: "task.md",
	productBrief: "brief.md",
	finalRubric: "final-rubric.md",
	pipeline: "pipeline.json",
	rubrics: "rubrics",
	target: { path: "/sources/template" },
};

const SESSION_CASE = {
	id: SESSION_CASE_ID,
	kind: "session",
	title: "Reply in the brief style",
	prompt: "Reply OK.",
	tools: [],
	corpusFiles: [],
	checks: [
		{ kind: "word-band", max: 120 },
		{ kind: "forbidden-text", strings: ["As an AI"] },
	],
};

const UNRUNNABLE_CASE = {
	...PIPELINE_CASE,
	id: "unrunnable",
	title: "A case whose pipeline names a missing rubric",
};

const UNFIT_RUBRIC_CASE = {
	...PIPELINE_CASE,
	id: "unfit-rubric",
	title: "A case whose build rubric does not fit its stage",
};

const ESCAPING_PIPELINE_CASE = {
	...PIPELINE_CASE,
	id: "escaping-pipeline",
	title: "A case whose pipeline path leaves its directory",
	pipeline: `../${CASE_ID}/pipeline.json`,
};

const ESCAPING_RUBRICS_CASE = {
	...PIPELINE_CASE,
	id: "escaping-rubrics",
	title: "A case whose rubrics path leaves its directory",
	rubrics: `../${CASE_ID}/rubrics`,
};

const PLANNING_RUBRIC = join(CONTROL_DIR, "cases/audit-log/rubrics/shape.json");
const DELIVERY_RUBRIC = join(CONTROL_DIR, "cases/audit-log/rubrics/build.json");

function pipelineFile(caseId: string, rubrics: readonly string[]): string {
	return JSON.stringify({
		statuses: ["To Do", "Done"],
		target: {
			checks: [{ command: ["bun", "run", "typecheck"] }],
			integrityFiles: ["package.json"],
		},
		stages: [
			{
				name: "discuss",
				kind: "planning",
				skill: "discuss",
				rubric: `cases/${caseId}/rubrics/${rubrics[0]}`,
				requiresAcceptanceCriteria: false,
			},
			{
				name: "build",
				kind: "delivery",
				skill: "build",
				rubric: `cases/${caseId}/rubrics/${rubrics[1]}`,
			},
		],
	});
}

const listingSchema = z.object({
	cases: z.array(z.object({ id: z.string() }).loose()),
	unreadable: z.array(z.object({ id: z.string(), reason: z.string() })),
	unreadableRecords: z.array(z.object({ id: z.string(), reason: z.string() })),
});

type Listing = z.infer<typeof listingSchema>;

type Listed = Listing["cases"][number];

describe("/api/cases", () => {
	const roots: string[] = [];

	afterEach(async () => {
		await Promise.all(
			roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
		);
	});

	async function temporaryDirectory(prefix: string): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), prefix));
		roots.push(root);

		return root;
	}

	async function casesRoot(): Promise<string> {
		const root = await temporaryDirectory("rehearse-cases-");
		for (const declaration of [
			PIPELINE_CASE,
			SESSION_CASE,
			UNRUNNABLE_CASE,
			UNFIT_RUBRIC_CASE,
			ESCAPING_PIPELINE_CASE,
			ESCAPING_RUBRICS_CASE,
		]) {
			await mkdir(join(root, declaration.id, "rubrics"), { recursive: true });
			await Bun.write(
				join(root, declaration.id, "case.json"),
				JSON.stringify(declaration),
			);
			await Bun.write(
				join(root, declaration.id, "rubrics", "discuss.json"),
				await Bun.file(PLANNING_RUBRIC).text(),
			);
			await Bun.write(
				join(root, declaration.id, "rubrics", "build.json"),
				await Bun.file(DELIVERY_RUBRIC).text(),
			);
		}
		await Bun.write(
			join(root, UNFIT_RUBRIC_CASE.id, "rubrics", "build.json"),
			"{}",
		);
		await Bun.write(
			join(root, UNFIT_RUBRIC_CASE.id, "pipeline.json"),
			pipelineFile(UNFIT_RUBRIC_CASE.id, ["discuss.json", "build.json"]),
		);
		await Bun.write(
			join(root, CASE_ID, "pipeline.json"),
			pipelineFile(CASE_ID, ["discuss.json", "build.json"]),
		);
		await Bun.write(
			join(root, ESCAPING_RUBRICS_CASE.id, "pipeline.json"),
			pipelineFile(ESCAPING_RUBRICS_CASE.id, ["discuss.json", "build.json"]),
		);
		await Bun.write(
			join(root, UNRUNNABLE_CASE.id, "pipeline.json"),
			pipelineFile(UNRUNNABLE_CASE.id, ["discuss.json", "missing.json"]),
		);

		return root;
	}

	interface Serving {
		readonly fixture: RecordedRunsFixture;
		readonly list: () => Promise<Listing>;
		readonly listed: (id: string) => Promise<Listed | undefined>;
	}

	async function serving(): Promise<Serving> {
		const runsDirectory = await temporaryDirectory("rehearse-cases-runs-");
		const app = createLaunchApp({
			runsDirectory,
			casesRoot: await casesRoot(),
			launcher: new FakeLauncher(),
			liveness: nothingRunning,
		});
		const list = async (): Promise<Listing> => {
			const response = await app.request("/api/cases");

			return listingSchema.parse(await response.json());
		};

		return {
			fixture: new RecordedRunsFixture(runsDirectory),
			list,
			listed: async (id) => {
				const { cases } = await list();

				return cases.find((listed) => listed.id === id);
			},
		};
	}

	it("gives a pipeline case its target, its steps with their rubrics, and its final rubric", async () => {
		const { listed } = await serving();

		expect(await listed(CASE_ID)).toEqual({
			id: CASE_ID,
			kind: "pipeline",
			title: PIPELINE_CASE.title,
			model: null,
			target: "/sources/template",
			steps: {
				state: "available",
				stages: [
					{ name: "discuss", rubric: "cases/audit-log/rubrics/discuss.json" },
					{ name: "build", rubric: "cases/audit-log/rubrics/build.json" },
				],
			},
			finalRubric: "final-rubric.md",
			figures: { state: "no-runs" },
			latestMinimumGrade: null,
		});
	});

	it("gives a session case no repository and its declared checks as its judges", async () => {
		const { listed } = await serving();

		expect(await listed(SESSION_CASE_ID)).toEqual({
			id: SESSION_CASE_ID,
			kind: "session",
			title: SESSION_CASE.title,
			model: null,
			target: null,
			checks: ["word-band", "forbidden-text"],
			figures: { state: "no-runs" },
		});
	});

	it("reads a pipeline case's median verdict, cost per run and latest minimum grade over its runs and group reps", async () => {
		const { fixture, listed } = await serving();
		await fixture.writeFailedVerdictRun(OLDER_RUN);
		await fixture.writeFinishedRunEvidence(NEWER_RUN);
		await fixture.gradeBuildBelowRaisedMinimum(NEWER_RUN);
		await fixture.writePipelineGroup("group-p", [PASS, undefined]);

		expect(await listed(CASE_ID)).toMatchObject({
			figures: {
				state: "measured",
				corpusVersion: null,
				counted: 4,
				leftOut: 0,
				judged: 3,
				passed: 2,
				median: "PASS",
				costPerRun: { meanUsd: 3.5, costed: 3, lacking: 1 },
			},
			latestMinimumGrade: { state: "recorded", letter: "A" },
		});
	});

	describe("when the latest run recorded no minimum grade", () => {
		it("reads it as not recorded", async () => {
			const { fixture, listed } = await serving();
			await fixture.writeFinishedRunEvidence(OLDER_RUN);

			expect(await listed(CASE_ID)).toMatchObject({
				latestMinimumGrade: { state: "not-recorded" },
			});
		});

		it("reads it as not recorded even when an older run recorded one", async () => {
			const { fixture, listed } = await serving();
			await fixture.writeFinishedRunEvidence(OLDER_RUN);
			await fixture.gradeBuildBelowRaisedMinimum(OLDER_RUN);
			await fixture.writeFinishedRunEvidence(NEWER_RUN);

			expect(await listed(CASE_ID)).toMatchObject({
				latestMinimumGrade: { state: "not-recorded" },
			});
		});
	});

	describe("when only a group ran a pipeline case", () => {
		it("reads its minimum grade as not recorded, since a group records none", async () => {
			const { fixture, listed } = await serving();
			await fixture.writePipelineGroup("group-p", [PASS, PASS]);

			expect(await listed(CASE_ID)).toMatchObject({
				latestMinimumGrade: { state: "not-recorded" },
			});
		});
	});

	it("counts a session case's attempts and group reps at the latest corpus version, with no letter", async () => {
		const { fixture, listed } = await serving();
		const digest = "d".repeat(64);
		await fixture.writeAttemptAt(
			"0f6b6f2a-0000-4000-8000-00000000000a",
			join(import.meta.dir, "..", ".."),
			SESSION_CASE_ID,
			[],
			{ kind: "version", digest },
		);
		await fixture.writeSessionGroup("group-s");

		expect(await listed(SESSION_CASE_ID)).toMatchObject({
			figures: {
				state: "measured",
				corpusVersion: digest,
				counted: 1,
				leftOut: 2,
				judged: 1,
				passed: 1,
				costPerRun: { meanUsd: 0.5, costed: 1, lacking: 0 },
			},
		});
		expect(await listed(SESSION_CASE_ID)).not.toHaveProperty("figures.median");
	});

	describe("when a case's pipeline file is one the harness would refuse", () => {
		it("lists the case with its steps unavailable and why", async () => {
			const { listed } = await serving();

			expect(await listed(UNRUNNABLE_CASE.id)).toMatchObject({
				steps: {
					state: "unavailable",
					reason: `Pipeline stage build names a missing rubric: cases/${UNRUNNABLE_CASE.id}/rubrics/missing.json`,
				},
			});
		});
	});

	describe("when a case's stage rubric does not fit its stage", () => {
		it("lists the case with its steps unavailable, as the harness refuses it", async () => {
			const { listed } = await serving();

			expect(await listed(UNFIT_RUBRIC_CASE.id)).toMatchObject({
				steps: {
					state: "unavailable",
					reason: expect.stringMatching(
						/^Pipeline stage build names a rubric it cannot use:/u,
					),
				},
			});
		});
	});

	describe("when a case's pipeline or rubrics path leaves its case directory", () => {
		it.each([
			{
				declaration: ESCAPING_PIPELINE_CASE,
				path: ESCAPING_PIPELINE_CASE.pipeline,
			},
			{
				declaration: ESCAPING_RUBRICS_CASE,
				path: ESCAPING_RUBRICS_CASE.rubrics,
			},
		])(
			"refuses to read $path, as the harness does",
			async ({ declaration, path }) => {
				const { listed } = await serving();

				expect(await listed(declaration.id)).toMatchObject({
					steps: {
						state: "unavailable",
						reason: `Case ${declaration.id} names a path outside its case directory: ${path}`,
					},
				});
			},
		);
	});

	it("reports a run record it cannot read apart from the declarations it cannot parse", async () => {
		const { fixture, list } = await serving();
		await fixture.writeUnreadableGroup("group-x");

		expect(await list()).toMatchObject({
			unreadable: [],
			unreadableRecords: [{ id: "group-x" }],
		});
	});
});
