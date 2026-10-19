import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { digest } from "./comparison-evidence-record-test-fixtures";
import type { ComparisonArm } from "./comparison-record";
import type { ConfirmationGroupRecord } from "./confirmation-record";

type FrozenInputFile = ConfirmationGroupRecord["inputs"]["files"][number] & {
	readonly content: string;
};

interface FrozenInputIdentity {
	readonly caseId: string;
	readonly role: ComparisonArm;
	readonly groupId: string;
}

function frozenRuntimeInputs(
	caseId: string,
	role: ComparisonArm,
): readonly Omit<FrozenInputFile, "sha256">[] {
	return [
		{
			content: `${caseId} checkpoint\n`,
			kind: "checkpoint" as const,
			path: "inputs/checkpoint/state.json",
		},
		{
			content: `${role} corpus\n`,
			kind: "corpus" as const,
			path: "inputs/corpus/build/SKILL.md",
		},
		{
			content: `${caseId} upstream corpus\n`,
			kind: "corpus" as const,
			path: "inputs/corpus/discuss/SKILL.md",
		},
		{
			content: `${role} corpus\n`,
			kind: "instructions" as const,
			path: "inputs/instructions.md",
		},
		{
			content: '{"stages":["build"]}\n',
			kind: "pipeline" as const,
			path: "inputs/pipeline.json",
		},
	];
}

function frozenTaskInputs(
	caseId: string,
): readonly Omit<FrozenInputFile, "sha256">[] {
	return [
		{
			content: `${caseId} brief\n`,
			kind: "product-brief" as const,
			path: "inputs/product-brief.md",
		},
		{
			content: `${caseId} rubric\n`,
			kind: "rubric" as const,
			path: "inputs/rubric.json",
		},
		{
			content: `${caseId} task\n`,
			kind: "task" as const,
			path: "inputs/task.md",
		},
	];
}

async function writeComparisonFrozenInputs(
	root: string,
	{ caseId, role, groupId }: FrozenInputIdentity,
): Promise<ConfirmationGroupRecord["inputs"]["files"]> {
	const directory = join(root, "groups", groupId);
	const files = [
		...frozenRuntimeInputs(caseId, role),
		...frozenTaskInputs(caseId),
	];
	await Array.fromAsync(files, async (file) => {
		const path = join(directory, file.path);
		await mkdir(dirname(path), { recursive: true });
		await Bun.write(path, file.content);
	});

	return files.map(({ content, kind, path }) => ({
		kind,
		path,
		sha256: digest(content),
	}));
}

export { writeComparisonFrozenInputs as default };
