import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { format } from "oxfmt";
import { z } from "zod";

import { CONTROL_DIR } from "#benchmark/config";
import {
	DELIVERY_RUBRIC,
	PIPELINE,
	PLANNING_RUBRIC,
	clearStepRoots,
	putSteps,
	serving,
} from "#server/pipeline-steps-test-fixture";

const NON_PIPELINE_CASES = ["sess-case", "no-such-case"];

const REFUSED_STEPS = [
	{
		refusing: "a rubric outside the case's rubrics",
		stages: [
			{
				kind: "delivery",
				name: "build",
				rubric: "cases/pipe-case/rubrics/missing.json",
				skill: "build",
			},
		],
	},
	{
		refusing: "a rubric that does not fit the step's kind",
		stages: [
			{
				kind: "delivery",
				name: "build",
				rubric: PLANNING_RUBRIC,
				skill: "build",
			},
		],
	},
	{
		refusing: "a skill name that is not a plain identifier",
		stages: [
			{
				kind: "delivery",
				name: "build",
				rubric: DELIVERY_RUBRIC,
				skill: "../build",
			},
		],
	},
	{ refusing: "no step at all", stages: [] },
];
describe("/api/cases/:id/steps", () => {
	afterEach(clearStepRoots);

	it(
		"answers a pipeline case's declared steps and the rubrics a step may name",
		verifyAnswersAPipelineCaseSDeclaredStepsAndTheRubricsAStepMayName,
	);

	it(
		"writes the edited steps into the case's pipeline, keeping the rest of the file",
		verifyWritesTheEditedStepsIntoTheCaseSPipelineKeepingTheRestOfTheFile,
	);

	it(
		"writes the file as the project's formatter would, so the edit is the only diff",
		verifyWritesTheFileAsTheProjectSFormatterWouldSoTheEditIsTheOnlyDiff,
	);

	it.each(REFUSED_STEPS)(
		"refuses $refusing and leaves the file as it was",
		async ({ stages }) => {
			const server = await serving();
			const before = await Bun.file(server.pipelineFile).text();

			const response = await putSteps(server, "pipe-case", stages);

			expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
			const refused = z
				.object({ error: z.string().nonempty() })
				.safeParse(await response.json());
			expect(refused.success).toBe(true);
			expect(await Bun.file(server.pipelineFile).text()).toBe(before);
		},
	);

	it(
		"answers 409 and writes nothing while the case's pipeline file is one the harness refuses",
		verifyAnswers409AndWritesNothingWhileTheCaseSPipelineFileIsOneTheHarnessRefuses,
	);

	it.each(NON_PIPELINE_CASES)(
		"answers 404 for %s, which declares no pipeline",
		verifyMissingCasePipeline,
	);
});

async function verifyAnswersAPipelineCaseSDeclaredStepsAndTheRubricsAStepMayName(): Promise<void> {
	const server = await serving();

	const response = await server.request("/api/cases/pipe-case/steps");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toEqual({
		caseId: "pipe-case",
		pipeline: "cases/pipe-case/pipeline.json",
		rubrics: [DELIVERY_RUBRIC, PLANNING_RUBRIC],
		stages: PIPELINE.stages,
	});
}

async function verifyWritesTheEditedStepsIntoTheCaseSPipelineKeepingTheRestOfTheFile(): Promise<void> {
	const server = await serving();
	const stages = [
		{
			kind: "delivery",
			name: "build",
			rubric: DELIVERY_RUBRIC,
			skill: "deliver",
		},
	];

	const response = await putSteps(server, "pipe-case", stages);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await Bun.file(server.pipelineFile).json()).toEqual({
		...PIPELINE,
		stages,
	});
	const read = await server.request("/api/cases/pipe-case/steps");
	expect(await read.json()).toMatchObject({ stages });
}

async function verifyWritesTheFileAsTheProjectSFormatterWouldSoTheEditIsTheOnlyDiff(): Promise<void> {
	const server = await serving();

	await putSteps(server, "pipe-case", PIPELINE.stages);

	const written = await Bun.file(server.pipelineFile).text();
	expect(written).toContain('\t"statuses": ["To Do", "Done"],\n');
	expect(written).toContain(
		'\t\t"checks": [\n\t\t\t{\n\t\t\t\t"command": ["bun", "run", "typecheck"]\n\t\t\t}\n\t\t],\n',
	);
	const formatterConfigFile = Bun.file(join(CONTROL_DIR, ".oxfmtrc.json"));
	const formatterConfig = z
		.looseObject({})
		.parse(await formatterConfigFile.json());
	const formatted = await format("pipeline.json", written, formatterConfig);
	expect(formatted.code).toBe(written);
}

async function verifyAnswers409AndWritesNothingWhileTheCaseSPipelineFileIsOneTheHarnessRefuses(): Promise<void> {
	const server = await serving();
	await Bun.write(server.pipelineFile, "{ not json");

	const read = await server.request("/api/cases/pipe-case/steps");
	const edit = await putSteps(server, "pipe-case", PIPELINE.stages);

	expect(read.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(edit.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(await Bun.file(server.pipelineFile).text()).toBe("{ not json");
}

async function verifyMissingCasePipeline(caseId: string): Promise<void> {
	const server = await serving();

	const read = await server.request(`/api/cases/${caseId}/steps`);
	const edit = await putSteps(server, caseId, PIPELINE.stages);

	expect(read.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
	expect(edit.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
}
