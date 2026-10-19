import { mkdir, mkdtemp, rename, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { assertPlanningStageCompleted } from "./backlog";
import { createBacklogTarget } from "./backlog-test-support";
import type { PlanningStageDefinition } from "./pipeline";
import type { TestRepository, TestResources } from "./test-support";

interface BacklogEvidenceFixture {
	readonly target: TestRepository;
	readonly board: string;
	readonly outside: string;
}

async function createEvidenceFixture(
	resources: Readonly<TestResources>,
): Promise<BacklogEvidenceFixture> {
	const target = await createBacklogTarget(resources);
	const outside = await mkdtemp(join(tmpdir(), "rehearse-workflow-outside-"));
	resources.track(outside);
	const board = join(target.directory, "backlog");

	await mkdir(board);
	await Bun.write(join(board, "config.yml"), "statuses: [To Do]\n");

	return { board, outside, target };
}

interface LinkedWorkflowEntry {
	readonly fixture: BacklogEvidenceFixture;
	readonly folder: "docs" | "tasks";
	readonly position: "leaf" | "parent";
	readonly destination: "inside" | "outside";
}

async function placeLinkedWorkflowEntry({
	fixture,
	folder,
	position,
	destination,
}: LinkedWorkflowEntry): Promise<void> {
	const directory = join(fixture.board, folder);
	const source =
		destination === "outside"
			? fixture.outside
			: join(fixture.board, `source-${folder}`);
	const filename =
		folder === "tasks" ? "task-1 - Card.md" : "doc-7 - Evidence-plan.md";

	await mkdir(source, { recursive: true });
	await Bun.write(
		join(source, filename),
		destination === "inside" ? "inside workflow\n" : "outside workflow\n",
	);
	if (position === "parent") {
		await symlink(source, directory);
		return;
	}

	await mkdir(directory, { recursive: true });
	await symlink(join(source, filename), join(directory, filename));
}

interface WorkflowLinkReplacement {
	readonly fixture: BacklogEvidenceFixture;
	readonly folder: "docs" | "tasks";
	readonly position: "leaf" | "parent";
}

async function replaceLinkedWorkflowEntry(
	entry: WorkflowLinkReplacement,
): Promise<void> {
	const directory = join(entry.fixture.board, `source-${entry.folder}`);
	const filename =
		entry.folder === "tasks" ? "task-1 - Card.md" : "doc-7 - Evidence-plan.md";
	const replaced =
		entry.position === "leaf" ? join(directory, filename) : directory;
	const destination =
		entry.position === "leaf"
			? join(entry.fixture.outside, filename)
			: entry.fixture.outside;
	await Bun.write(join(entry.fixture.outside, filename), "outside workflow\n");
	await rename(replaced, `${replaced}.held`);
	await symlink(destination, replaced);
}

const ARTIFACT_STAGE: PlanningStageDefinition = {
	artifact: "plan",
	kind: "planning",
	name: "plan",
	requiresAcceptanceCriteria: true,
	rubric: "rubrics/plan.json",
	skill: "plan",
};

async function planningCompletion(
	{ target }: BacklogEvidenceFixture,
	stage: PlanningStageDefinition = ARTIFACT_STAGE,
): ReturnType<typeof assertPlanningStageCompleted> {
	return await assertPlanningStageCompleted(
		{ baselineSha: target.sha, targetDir: target.directory },
		{
			stage,
			taskState: {
				output: "owned task output",
				view: { task: { acceptanceCriteria: [{}], documentation: ["doc-7"] } },
			},
		},
	);
}

interface OutsideBoardLink {
	readonly fixture: BacklogEvidenceFixture;
	readonly folder: "docs" | "tasks";
}

async function placeOutsideBoardLink({
	fixture,
	folder,
}: OutsideBoardLink): Promise<void> {
	const filename =
		folder === "tasks" ? "task-1 - Card.md" : "doc-7 - Evidence-plan.md";
	const directory = join(fixture.outside, folder);

	await mkdir(directory);
	await Bun.write(join(directory, filename), "outside workflow\n");
	await Bun.write(
		join(fixture.target.directory, ".git", "info", "exclude"),
		"/backlog\n",
	);
	await rm(fixture.board, { recursive: true });
	await symlink(fixture.outside, fixture.board);
}

export {
	createEvidenceFixture,
	placeLinkedWorkflowEntry,
	planningCompletion,
	placeOutsideBoardLink,
	replaceLinkedWorkflowEntry,
};
