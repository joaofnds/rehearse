import { join } from "node:path";

import { z } from "zod";

import type { Immutable } from "#benchmark/contracts";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import type { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import type { SessionAttemptRecord } from "#benchmark/session-record";

import PipelineDefinitionBuilder from "./pipeline-definition-test-builder";

/** A session attempt record, read loosely so a test can drop one field. */
const sessionRecordSchema = z.looseObject({ metrics: z.unknown() });

/** A group record, read loosely so a test can add a frozen file to its inputs. */
const frozenFilesSchema = z.looseObject({ files: z.array(z.unknown()) });

const frozenInputsSchema = z.looseObject({
	inputs: frozenFilesSchema,
});

/** Replaces fields of the fixture's session attempt record, as its writer would have. */
async function rewriteSessionAttempt(
	fixture: RecordedRunsFixture,
	changes: Immutable<Partial<SessionAttemptRecord>>,
): Promise<void> {
	const file = Bun.file(fixture.sessionAttemptFile);
	const record = sessionRecordSchema.parse(await file.json());
	await Bun.write(file, JSON.stringify({ ...record, ...changes }));
}

/** Writes the stage record a rep's stage judge leaves, with its hard blockers. */
async function gradeRepStage(
	stageFile: string,
	hardBlockers: readonly {
		readonly id: string;
		readonly status: "PASS" | "FAIL";
	}[],
): Promise<void> {
	await Bun.write(
		stageFile,
		JSON.stringify({
			grade: { grade: "B", hardBlockers, verdict: "CONTINUE" },
		}),
	);
}

interface FrozenDeliveryPipeline {
	readonly fixture: RecordedRunsFixture;
	readonly groupId: string;
	readonly stageNames: readonly string[];
}

interface FrozenPipeline {
	readonly fixture: RecordedRunsFixture;
	readonly groupId: string;
	readonly content: string;
}

async function freezeDeliveryPipeline({
	fixture,
	groupId,
	stageNames,
}: FrozenDeliveryPipeline): Promise<void> {
	const content = JSON.stringify(
		new PipelineDefinitionBuilder({
			stages: stageNames.map((name) => ({
				kind: "delivery",
				name,
				rubric: `${name}.json`,
				skill: name,
			})),
			statuses: ["Build"],
			target: {
				checks: [{ command: ["true"] }],
				integrityFiles: ["README.md"],
			},
		}).build(),
	);
	await freezePipeline({ content, fixture, groupId });
}

async function freezePipeline({
	fixture,
	groupId,
	content,
}: FrozenPipeline): Promise<void> {
	const paths = confirmationGroupPaths(fixture.runsDirectory, groupId);

	await Bun.write(join(paths.inputsDirectory, "pipeline.json"), content);

	const group = frozenInputsSchema.parse(
		await Bun.file(paths.groupFile).json(),
	);
	const frozen = {
		kind: "pipeline",
		path: "inputs/pipeline.json",
		sha256: new Bun.CryptoHasher("sha256").update(content).digest("hex"),
	};

	await Bun.write(
		paths.groupFile,
		JSON.stringify({
			...group,
			inputs: { ...group.inputs, files: [...group.inputs.files, frozen] },
		}),
	);
}

export {
	rewriteSessionAttempt,
	gradeRepStage,
	freezeDeliveryPipeline,
	freezePipeline,
	sessionRecordSchema,
};
