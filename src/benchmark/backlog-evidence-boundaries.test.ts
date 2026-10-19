import { describe, expect, it } from "bun:test";
import { mkdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";

import { assertPlanningStageCompleted, readTaskCard } from "./backlog";
import {
	openWorkflowText,
	readWorkflowText,
	workflowBoardPath,
} from "./backlog-evidence-files";
import {
	createEvidenceFixture,
	placeLinkedWorkflowEntry,
	placeOutsideBoardLink,
	planningCompletion,
	replaceLinkedWorkflowEntry,
} from "./backlog-evidence-test-support";
import { SymlinkedEntryError } from "./file-presence";
import { TestResources, commitAll } from "./test-support";

const resources = TestResources.forEachTest();
const LINK_POSITIONS = [{ position: "leaf" }, { position: "parent" }] as const;

function cardEvidenceBoundaries(): void {
	it.each([...LINK_POSITIONS])(
		"refuses a $position link that reads a card outside the board",
		async ({ position }) => {
			const fixture = await createEvidenceFixture(resources);
			await placeLinkedWorkflowEntry({
				destination: "outside",
				fixture,
				folder: "tasks",
				position,
			});

			expect(
				readTaskCard(fixture.target.directory, "TASK-1"),
			).rejects.toBeInstanceOf(SymlinkedEntryError);
		},
	);

	it.each([...LINK_POSITIONS])(
		"reads a card through a $position link that stays inside the board",
		async ({ position }) => {
			const fixture = await createEvidenceFixture(resources);
			await placeLinkedWorkflowEntry({
				destination: "inside",
				fixture,
				folder: "tasks",
				position,
			});

			const card = await readTaskCard(fixture.target.directory, "TASK-1");

			expect(card).toBe("inside workflow\n");
		},
	);
}

function artifactEvidenceBoundaries(): void {
	it.each([...LINK_POSITIONS])(
		"refuses a $position link that reads an artifact outside the board",
		async ({ position }) => {
			const fixture = await createEvidenceFixture(resources);
			await placeLinkedWorkflowEntry({
				destination: "outside",
				fixture,
				folder: "docs",
				position,
			});

			expect(planningCompletion(fixture)).rejects.toBeInstanceOf(
				SymlinkedEntryError,
			);
		},
	);

	it.each([...LINK_POSITIONS])(
		"reads an artifact through a $position link that stays inside the board",
		async ({ position }) => {
			const fixture = await createEvidenceFixture(resources);
			await placeLinkedWorkflowEntry({
				destination: "inside",
				fixture,
				folder: "docs",
				position,
			});

			const completed = await planningCompletion(fixture);

			expect(completed.artifact).toEqual({
				content: "inside workflow\n",
				path: "backlog/docs/doc-7 - Evidence-plan.md",
			});
			expect(completed.taskState).toBe("owned task output");
		},
	);
}

function documentReadFailures(): void {
	it("propagates document-directory I/O failure instead of grading missing evidence", async () => {
		const fixture = await createEvidenceFixture(resources);
		await Bun.write(join(fixture.board, "docs"), "not a directory\n");

		expect(planningCompletion(fixture)).rejects.toMatchObject({
			code: "ENOTDIR",
		});
	});

	it("still reports a missing required artifact when its document directory is absent", async () => {
		const fixture = await createEvidenceFixture(resources);

		expect(planningCompletion(fixture)).rejects.toThrow(
			"plan completed without its durable plan document",
		);
	});

	it("accepts an absent document directory when the stage needs no artifact", async () => {
		const fixture = await createEvidenceFixture(resources);

		const completed = await planningCompletion(fixture, {
			kind: "planning",
			name: "shape",
			requiresAcceptanceCriteria: false,
			rubric: "rubrics/shape.json",
			skill: "shape",
		});

		expect(completed.artifact).toBeUndefined();
	});
}

describe(readTaskCard.name, cardEvidenceBoundaries);
describe(assertPlanningStageCompleted.name, () => {
	describe("workflow links", artifactEvidenceBoundaries);
	describe("when the document directory cannot be read", documentReadFailures);
});

describe(readTaskCard.name, () => {
	it("refuses a configuration-free board root linked outside the target", async () => {
		const fixture = await createEvidenceFixture(resources);
		await placeOutsideBoardLink({ fixture, folder: "tasks" });

		expect(
			readTaskCard(fixture.target.directory, "TASK-1"),
		).rejects.toBeInstanceOf(SymlinkedEntryError);
	});

	it("refuses an empty task directory linked outside the board before listing it", async () => {
		const fixture = await createEvidenceFixture(resources);
		await symlink(fixture.outside, join(fixture.board, "tasks"));

		expect(
			readTaskCard(fixture.target.directory, "TASK-1"),
		).rejects.toBeInstanceOf(SymlinkedEntryError);
	});
});

describe(assertPlanningStageCompleted.name, () => {
	it("refuses a configuration-free board root linked outside the target", async () => {
		const fixture = await createEvidenceFixture(resources);
		await placeOutsideBoardLink({ fixture, folder: "docs" });

		expect(planningCompletion(fixture)).rejects.toBeInstanceOf(
			SymlinkedEntryError,
		);
	});

	it("refuses an empty document directory linked outside the board before listing it", async () => {
		const fixture = await createEvidenceFixture(resources);
		await symlink(fixture.outside, join(fixture.board, "docs"));

		expect(planningCompletion(fixture)).rejects.toBeInstanceOf(
			SymlinkedEntryError,
		);
	});

	it("reads a regular artifact from a configuration-free board", async () => {
		const fixture = await createEvidenceFixture(resources);
		await rm(join(fixture.board, "config.yml"));
		await mkdir(join(fixture.board, "docs"));
		await Bun.write(
			join(fixture.board, "docs", "doc-7 - Evidence-plan.md"),
			"regular artifact\n",
		);

		const completed = await planningCompletion(fixture);

		expect(completed.artifact).toEqual({
			content: "regular artifact\n",
			path: "backlog/docs/doc-7 - Evidence-plan.md",
		});
	});
});

const MISSING_BOARD_STAGES = [
	{
		label: "artifact stage",
		stage: {
			artifact: "plan",
			kind: "planning",
			name: "plan",
			requiresAcceptanceCriteria: true,
			rubric: "rubrics/plan.json",
			skill: "plan",
		},
	},
	{
		label: "card-only stage",
		stage: {
			kind: "planning",
			name: "shape",
			requiresAcceptanceCriteria: false,
			rubric: "rubrics/shape.json",
			skill: "shape",
		},
	},
] as const;

describe("when the configured board root is absent", () => {
	it.each([...MISSING_BOARD_STAGES])(
		"propagates its absence as infrastructure failure for an $label",
		async ({ stage }) => {
			const fixture = await createEvidenceFixture(resources);
			await Bun.write(
				join(fixture.target.directory, "backlog.config.yml"),
				"statuses: [To Do]\nbacklog_directory: workflow-board\n",
			);
			await commitAll(
				fixture.target.directory,
				"fixture: configure absent board",
			);

			expect(planningCompletion(fixture, stage)).rejects.toMatchObject({
				code: "ENOENT",
			});
		},
	);
});

describe("when a workflow path is replaced after opening its text", () => {
	it.each([...LINK_POSITIONS])(
		"reads the held file when its $position link is replaced",
		async ({ position }) => {
			const fixture = await createEvidenceFixture(resources);
			await placeLinkedWorkflowEntry({
				destination: "inside",
				fixture,
				folder: "tasks",
				position,
			});
			const board = await workflowBoardPath({
				board: fixture.board,
				targetDir: fixture.target.directory,
			});
			const entry = { board, path: join(board, "tasks", "task-1 - Card.md") };
			const opened = await openWorkflowText(entry);
			try {
				await replaceLinkedWorkflowEntry({
					fixture,
					folder: "tasks",
					position,
				});

				expect(await opened.read()).toBe("inside workflow\n");
				expect(readWorkflowText(entry)).rejects.toBeInstanceOf(
					SymlinkedEntryError,
				);
			} finally {
				await opened.close();
			}
		},
	);
});
