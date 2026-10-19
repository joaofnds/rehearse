import type { Immutable } from "#benchmark/contracts";
import type { JsonObject } from "#benchmark/json-value";

class CaseDeclarationBuilder {
	private readonly overrides: Immutable<JsonObject>;

	public constructor(overrides: Immutable<JsonObject> = {}) {
		this.overrides = overrides;
	}

	public pipelineJson(): string {
		return JSON.stringify({
			finalRubric: "rubric.md",
			id: "audit-log",
			kind: "pipeline",
			pipeline: "pipelines/default.json",
			productBrief: "product-brief.md",
			rubrics: "rubrics",
			target: { path: "../../../nest/template" },
			task: "backlog-seed.md",
			title: "Audit log",
			...this.overrides,
		});
	}

	public sessionJson(): string {
		return JSON.stringify({
			checks: [{ kind: "word-band", max: 1 }],
			corpusFiles: [],
			id: "smoke",
			kind: "session",
			prompt: "Reply with the single word OK.",
			title: "Smoke",
			tools: [],
			...this.overrides,
		});
	}
}

const BUILD_RUBRIC = {
	dimensions: [],
	hardBlockers: [
		{ description: "d", id: "invalid-stage-delivery" },
		{ description: "d", id: "false-test-safety" },
		{ description: "d", id: "unfinished-delivery" },
	],
	requirements: [],
} as const;

const BUILD_PIPELINE = {
	stages: [{ kind: "delivery", name: "build", rubric: "b", skill: "build" }],
	statuses: ["To Do", "Build", "Done"],
	target: {
		checks: [{ command: ["true"] }],
		integrityFiles: ["base.txt"],
	},
} as const;

function pipelineWithoutTask(
	id: string,
): readonly (readonly [relativePath: string, contents: string])[] {
	const files = {
		"case.json": new CaseDeclarationBuilder({
			id,
			pipeline: "pipeline.json",
			target: { path: "/tmp/does-not-matter" },
			title: "Missing task",
		}).pipelineJson(),
		"pipeline.json": JSON.stringify(BUILD_PIPELINE),
		"product-brief.md": "Brief",
		"rubric.md": "Rubric",
		"rubrics/build.json": JSON.stringify(BUILD_RUBRIC),
	};

	return Object.entries(files);
}

export { CaseDeclarationBuilder, pipelineWithoutTask };
