import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { CONTROL_DIR } from "#benchmark/config";

const BUNDLE_STAGES = [
	{ kind: "planning", name: "shape", rubric: "shape.json", skill: "shape" },
	{ kind: "delivery", name: "build", rubric: "build.json", skill: "build" },
];

const BRIEF = "# Brief\n\nOperators read the log.\n";

const TASK = "# Add an audit log\n\nRecord every write.\n";

const FINAL_RUBRIC = "# Final rubric\n\nThe log records every write.\n";

const PIPELINE = {
	stages: [
		{
			kind: "planning",
			name: "shape",
			rubric: "cases/pipe-case/rubrics/shape.json",
			skill: "shape",
		},
		{
			kind: "delivery",
			name: "build",
			rubric: "cases/pipe-case/rubrics/build.json",
			skill: "build",
		},
	],
	statuses: ["To Do", "Done"],
	target: {
		checks: [{ command: ["bun", "run", "typecheck"] }],
		integrityFiles: ["package.json"],
		setup: [{ command: ["bun", "install"] }],
	},
};

const PIPELINE_CASE = {
	finalRubric: "rubric.md",
	id: "pipe-case",
	kind: "pipeline",
	model: "sonnet",
	pipeline: "pipeline.json",
	productBrief: "brief.md",
	rubrics: "rubrics",
	sessionBudgetUsd: 5,
	target: { path: "../../target" },
	task: "task.md",
	title: "A pipeline case",
};

const SESSION_CASE = {
	checks: [{ kind: "word-band", max: 1 }],
	corpusFiles: [],
	id: "sess-case",
	kind: "session",
	prompt: "Reply OK.",
	title: "A session case",
	tools: [],
};

async function writeBundleCases(cases: string): Promise<void> {
	await Array.fromAsync([PIPELINE_CASE, SESSION_CASE], async (declaration) => {
		await mkdir(join(cases, declaration.id), { recursive: true });
		await Bun.write(
			join(cases, declaration.id, "case.json"),
			JSON.stringify(declaration),
		);
	});
	await writePipelineFiles(join(cases, "pipe-case"));
}

async function writePipelineFiles(directory: string): Promise<void> {
	await Bun.write(join(directory, "pipeline.json"), JSON.stringify(PIPELINE));
	await Bun.write(join(directory, "task.md"), TASK);
	await Bun.write(join(directory, "brief.md"), BRIEF);
	await Bun.write(join(directory, "rubric.md"), FINAL_RUBRIC);
	await Array.fromAsync(["shape.json", "build.json"], async (rubric) => {
		await Bun.write(
			join(directory, "rubrics", rubric),
			await Bun.file(
				join(CONTROL_DIR, "cases/audit-log/rubrics", rubric),
			).text(),
		);
	});
}

export { BRIEF, TASK, FINAL_RUBRIC, PIPELINE, BUNDLE_STAGES, writeBundleCases };
