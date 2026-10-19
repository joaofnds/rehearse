import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	assertStageArtifactState,
	parseTaskState,
	readTaskCard,
} from "./backlog";
import { StageValidationError } from "./contracts";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

const view = {
	task: {
		acceptanceCriteria: [{}],
		documentation: ["doc-1", "doc-2", "doc-3"],
	},
};

const planStage = {
	artifact: "plan",
	kind: "planning",
	name: "plan",
	requiresAcceptanceCriteria: false,
	rubric: "rubrics/plan.json",
	skill: "plan",
} as const;

function acceptsStageWithoutArtifact(): void {
	const { artifact: _artifact, ...cardOnlyStage } = planStage;

	expect(assertStageArtifactState(cardOnlyStage, view, [])).toBeUndefined();
}

function requiresCriteriaWithoutArtifact(): void {
	const { artifact: _artifact, ...cardOnlyStage } = planStage;

	expect(() =>
		assertStageArtifactState(
			{ ...cardOnlyStage, requiresAcceptanceCriteria: true },
			{ task: { acceptanceCriteria: [], documentation: [] } },
			[],
		),
	).toThrow("without acceptance criteria");
}

function rejectsEmptyCriteria(): void {
	expect(() =>
		assertStageArtifactState(
			{ ...planStage, requiresAcceptanceCriteria: true },
			{ task: { acceptanceCriteria: [], documentation: ["doc-3"] } },
			["doc-3 - Asynchronous-audit-log-module-plan.md"],
		),
	).toThrow("without acceptance criteria");
}

function acceptsOptionalCriteria(): void {
	expect(
		assertStageArtifactState(
			{ ...planStage, requiresAcceptanceCriteria: false },
			{ task: { acceptanceCriteria: [], documentation: ["doc-3"] } },
			["doc-3 - Asynchronous-audit-log-module-plan.md"],
		),
	).toBe("doc-3 - Asynchronous-audit-log-module-plan.md");
}

function resolvesAttachedDocumentIds(): void {
	expect(
		assertStageArtifactState(planStage, view, [
			"doc-1 - Asynchronous-audit-log-module-spec.md",
			"doc-2 - Asynchronous-audit-log-module-grilled.md",
			"doc-3 - Asynchronous-audit-log-module-plan.md",
		]),
	).toBe("doc-3 - Asynchronous-audit-log-module-plan.md");
}

function rejectsUnattachedDocument(): void {
	expect(() =>
		assertStageArtifactState(planStage, view, ["doc-4 - Unattached-plan.md"]),
	).toThrow("without its durable plan document");
}

function acceptsDocumentationPaths(): void {
	expect(
		assertStageArtifactState(
			{
				artifact: "spec",
				kind: "planning",
				name: "discuss",
				requiresAcceptanceCriteria: true,
				rubric: "rubrics/discuss.json",
				skill: "discuss",
			},
			{
				task: {
					acceptanceCriteria: [{}],
					documentation: ["backlog/docs/doc-1 - audit-log-module-spec.md"],
				},
			},
			["doc-1 - audit-log-module-spec.md"],
		),
	).toBe("doc-1 - audit-log-module-spec.md");
}

describe(assertStageArtifactState.name, () => {
	it(
		"requires no document from a stage that declares no artifact",
		acceptsStageWithoutArtifact,
	);
	it(
		"still requires acceptance criteria from a stage without an artifact",
		requiresCriteriaWithoutArtifact,
	);
	it(
		"rejects a stage that requires acceptance criteria and has none",
		rejectsEmptyCriteria,
	);
	it(
		"accepts an empty acceptance list when the stage does not require it",
		acceptsOptionalCriteria,
	);
	it(
		"resolves attached document IDs to titled artifact files",
		resolvesAttachedDocumentIds,
	);
	it(
		"rejects an unattached document with the expected suffix",
		rejectsUnattachedDocument,
	);
	it(
		"accepts Backlog documentation paths as attachment references",
		acceptsDocumentationPaths,
	);
});

describe(readTaskCard.name, () => {
	it("returns the card file matching the task id", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-card-"));
		testResources.track(directory);
		await mkdir(join(directory, "backlog", "tasks"), { recursive: true });
		await Bun.write(
			join(directory, "backlog", "tasks", "task-1 - Audit-log.md"),
			"## Goal\nthe card\n",
		);

		await Bun.write(
			join(directory, "backlog", "tasks", "task-2 - Other.md"),
			"## Goal\nanother card\n",
		);

		expect(await readTaskCard(directory, "TASK-1")).toContain("the card");
		expect(await readTaskCard(directory, "TASK-2")).toBe(
			"## Goal\nanother card\n",
		);
	});

	it("rejects a task without a card file", async () => {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-card-"));
		testResources.track(directory);
		await mkdir(join(directory, "backlog", "tasks"), { recursive: true });

		expect(readTaskCard(directory, "TASK-9")).rejects.toThrow(
			"No task card found",
		);
	});
});

describe(parseTaskState.name, () => {
	it("classifies malformed Backlog output as candidate validation failure", () => {
		expect(() => parseTaskState("not json")).toThrow(StageValidationError);
	});
});
