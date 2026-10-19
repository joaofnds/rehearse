import { dirname, join, relative } from "node:path";

import type { CheckpointRecord } from "./checkpoint-record";
import {
	SHA256_HEX_CHARACTERS,
	digest,
} from "./comparison-evidence-record-test-fixtures";
import type { ComparisonEvidenceFixture } from "./comparison-evidence-test-support";
import { readComparisonGroup } from "./comparison-evidence-test-support";
import type { ComparisonArm } from "./comparison-record";
import type { ConfirmationGroupRecord } from "./confirmation-record";
import {
	confirmationGroupRecordSchema,
	parseConfirmationRepRecord,
} from "./confirmation-record";
import type { Immutable } from "./contracts";

interface PipelineCheckpointScenario {
	readonly role: ComparisonArm;
	readonly changedWorkflowRole: ComparisonArm | undefined;
}

interface PipelineRepIdentity {
	readonly caseId: string;
	readonly role: ComparisonArm;
	readonly ordinal: number;
}

const ROLE_INITIAL_CODE_UNITS = 1;

const PREFIX_START_INDEX = 0;

const REP_IDENTITIES = [{ ordinal: 1 }, { ordinal: 2 }] as const;

const JSON_INDENTATION_SPACES = 2;

const GIT_SHA_HEX_CHARACTERS = 40;

interface PipelineInputFiles {
	readonly checkpoint: ConfirmationGroupRecord["inputs"]["files"][number];
	readonly upstreamCorpusSha256: string;
}

async function finishPipelineRep(
	fixture: ComparisonEvidenceFixture,
	{ caseId, role, ordinal }: PipelineRepIdentity,
): Promise<void> {
	const repFile = fixture.repFile(caseId, role, ordinal);
	const rep = parseConfirmationRepRecord(await Bun.file(repFile).text());
	await Bun.write(
		repFile,
		`${JSON.stringify(
			{
				...rep,
				finalOutcome: {
					evidence: {
						recordFile: "final.json",
						resultSha: "e".repeat(GIT_SHA_HEX_CHARACTERS),
					},
					status: "JUDGED",
					verdict: "PASS",
				},
				mode: "pipeline",
			},
			null,
			JSON_INDENTATION_SPACES,
		)}\n`,
	);
}

function pipelineCheckpoint({
	role,
	changedWorkflowRole,
}: PipelineCheckpointScenario): CheckpointRecord {
	return {
		artifacts: [],
		corpusFiles: [],
		lineage: `${role}-derived-lineage`,
		model: "sonnet",
		stage: "initial",
		targetSha: role
			.slice(PREFIX_START_INDEX, ROLE_INITIAL_CODE_UNITS)
			.repeat(GIT_SHA_HEX_CHARACTERS),
		upstream: `${role}-derived-upstream`,
		workflowState:
			role === changedWorkflowRole
				? [
						{
							path: "backlog/tasks/act.md",
							sha256: "f".repeat(SHA256_HEX_CHARACTERS),
						},
					]
				: [],
	};
}

async function writePipelineInputs(
	directory: string,
	scenario: PipelineCheckpointScenario,
): Promise<PipelineInputFiles> {
	const checkpointPath = join(directory, "inputs/checkpoint/checkpoint.json");
	const checkpointText = `${JSON.stringify(pipelineCheckpoint(scenario), null, JSON_INDENTATION_SPACES)}\n`;
	await Bun.write(checkpointPath, checkpointText);
	const upstreamCorpus = `${scenario.role} upstream corpus\n`;
	const upstreamCorpusPath = join(directory, "inputs/corpus/discuss/SKILL.md");
	await Bun.write(upstreamCorpusPath, upstreamCorpus);
	return {
		checkpoint: {
			kind: "checkpoint",
			path: relative(directory, checkpointPath),
			sha256: digest(checkpointText),
		},
		upstreamCorpusSha256: digest(upstreamCorpus),
	};
}

function pipelineGroupRecord(
	group: Immutable<ConfirmationGroupRecord>,
	files: PipelineInputFiles,
): ConfirmationGroupRecord {
	return confirmationGroupRecordSchema.parse({
		...group,
		inputs: {
			...group.inputs,
			files: [
				...group.inputs.files.map((file) =>
					file.path === "inputs/corpus/discuss/SKILL.md"
						? {
								kind: file.kind,
								path: file.path,
								sha256: files.upstreamCorpusSha256,
							}
						: file,
				),
				files.checkpoint,
			],
		},
		mode: "pipeline",
	});
}

async function preparePipelineGroup(
	fixture: ComparisonEvidenceFixture,
	{ caseId, role }: Omit<PipelineRepIdentity, "ordinal">,
	changedWorkflowRole: ComparisonArm | undefined,
): Promise<void> {
	const groupFile = fixture.groupFile(caseId, role);
	const group = await readComparisonGroup(groupFile);
	const files = await writePipelineInputs(dirname(groupFile), {
		changedWorkflowRole,
		role,
	});
	const changedGroup = pipelineGroupRecord(group, files);
	await Bun.write(
		groupFile,
		`${JSON.stringify(changedGroup, null, JSON_INDENTATION_SPACES)}\n`,
	);
	await Array.fromAsync(REP_IDENTITIES, async ({ ordinal }) => {
		await finishPipelineRep(fixture, { caseId, ordinal, role });
	});
}

async function usePipelineCheckpoints(
	fixture: ComparisonEvidenceFixture,
	changedWorkflowRole?: ComparisonArm,
): Promise<void> {
	await Array.fromAsync(fixture.caseIds, async (caseId) => {
		await Array.fromAsync(
			["baseline", "candidate", "control"] as const,
			async (role) => {
				await preparePipelineGroup(
					fixture,
					{ caseId, role },
					changedWorkflowRole,
				);
			},
		);
	});
}

export { usePipelineCheckpoints as default };
