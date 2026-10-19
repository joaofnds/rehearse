import { dirname, join } from "node:path";

import { digest } from "./comparison-evidence-record-test-fixtures";
import type { ComparisonEvidenceFixture } from "./comparison-evidence-test-support";
import { readComparisonGroup } from "./comparison-evidence-test-support";
import type { ComparisonArm } from "./comparison-record";
import type { ConfirmationGroupRecord } from "./confirmation-record";
import { confirmationGroupRecordSchema } from "./confirmation-record";

const JSON_INDENTATION_SPACES = 2;

async function pointFrozenInputAt(
	fixture: ComparisonEvidenceFixture,
	kind: ConfirmationGroupRecord["inputs"]["files"][number]["kind"],
	path: string,
): Promise<void> {
	const sha256 = digest(await Bun.file(path).text());
	await Array.fromAsync(fixture.caseIds, async (caseId) => {
		await Array.fromAsync(
			["baseline", "candidate", "control"] as const,
			async (role) => {
				const groupFile = fixture.groupFile(caseId, role);
				const group = await readComparisonGroup(groupFile);
				const changed = confirmationGroupRecordSchema.parse({
					...group,
					inputs: {
						...group.inputs,
						files: group.inputs.files.map((file) =>
							file.kind === kind ? { kind: file.kind, path, sha256 } : file,
						),
					},
				});
				await Bun.write(
					groupFile,
					`${JSON.stringify(changed, null, JSON_INDENTATION_SPACES)}\n`,
				);
			},
		);
	});
}

async function useJudgeModel(
	fixture: ComparisonEvidenceFixture,
	caseId: string,
	judgeModel: string,
): Promise<void> {
	await Array.fromAsync(
		["baseline", "candidate", "control"] as const,
		async (role) => {
			const groupFile = fixture.groupFile(caseId, role);
			const group = await readComparisonGroup(groupFile);
			await Bun.write(
				groupFile,
				`${JSON.stringify(
					{
						...group,
						inputs: { ...group.inputs, judgeModel },
					},
					null,
					JSON_INDENTATION_SPACES,
				)}\n`,
			);
		},
	);
}

async function changePipelineTarget(
	fixture: ComparisonEvidenceFixture,
	caseId: string,
	role: ComparisonArm,
): Promise<void> {
	const groupFile = fixture.groupFile(caseId, role);
	const group = await readComparisonGroup(groupFile);
	const pipeline = group.inputs.files.find(({ kind }) => kind === "pipeline");
	if (pipeline === undefined) {
		throw new Error("Expected a frozen pipeline input");
	}
	const content = `${JSON.stringify({
		stages: ["build"],
		target: {
			checks: [{ command: ["bun", "run", "different"] }],
			integrityFiles: ["package.json"],
		},
	})}\n`;
	const groupDirectory = dirname(groupFile);
	await Bun.write(join(groupDirectory, pipeline.path), content);
	const changed = confirmationGroupRecordSchema.parse({
		...group,
		inputs: {
			...group.inputs,
			files: group.inputs.files.map((file) =>
				file.kind === "pipeline"
					? { kind: file.kind, path: file.path, sha256: digest(content) }
					: file,
			),
		},
	});
	await Bun.write(
		groupFile,
		`${JSON.stringify(changed, null, JSON_INDENTATION_SPACES)}\n`,
	);
}

export { changePipelineTarget, pointFrozenInputAt, useJudgeModel };
