import { describe, expect, it } from "bun:test";

import { analyzeRun } from "./root-cause-analysis";
import {
	ANSWER,
	FakeAnalysisProvider,
	answering,
	recordAnalysis,
} from "./root-cause-analysis-provider-test-fixtures";
import {
	FIRST_RECORDED_STAGE_INDEX,
	SECOND_RECORDED_STAGE_INDEX,
	dependencies,
	registerAnalysisFixtureCleanup,
	runsDirectory,
} from "./root-cause-analysis-test-environment";
import {
	CORPUS_BODIES,
	RUN,
	runStoppedAtBuild,
	runWithOneGradedStage,
	stoppedStage,
	writeStage,
} from "./root-cause-analysis-test-support";

registerAnalysisFixtureCleanup();

const ANALYSIS_EXAMPLES_4 = [
	[
		"names a root-cause file the root-cause stage never read",
		{
			...ANSWER,
			rootCause: { file: "skills/shape/SKILL.md", stage: "build" },
		},
		"The root-cause file skills/shape/SKILL.md is not a corpus file the build stage read",
	],
	[
		"names a root-cause stage that never ran",
		{ ...ANSWER, rootCause: { file: "CLAUDE.md", stage: "review" } },
		"The answer names review as the root-cause stage, so review and no other stage must be the root cause",
	],
	[
		"names two root causes",
		{
			...ANSWER,
			stages: [
				ANSWER.stages[SECOND_RECORDED_STAGE_INDEX],
				{
					...ANSWER.stages[FIRST_RECORDED_STAGE_INDEX],
					role: "root cause",
				},
			],
		},
		"The answer names build as the root-cause stage, so build and no other stage must be the root cause",
	],
	[
		"names a root cause whose stage has another role",
		{
			...ANSWER,
			stages: [
				ANSWER.stages[FIRST_RECORDED_STAGE_INDEX],
				{
					...ANSWER.stages[SECOND_RECORDED_STAGE_INDEX],
					role: "contributing factor",
				},
			],
		},
		"The answer names build as the root-cause stage, so build and no other stage must be the root cause",
	],
	[
		"gives a stage the root-cause role with a null rootCause",
		{ ...ANSWER, rootCause: null },
		"The answer gives a stage the root-cause role but names no root-cause file",
	],
	[
		"leaves out a stage that ran",
		{ ...ANSWER, stages: [ANSWER.stages[SECOND_RECORDED_STAGE_INDEX]] },
		"The answer reads stages build, but the stages that ran are build, shape",
	],
	[
		"reads a stage that never ran",
		{
			...ANSWER,
			stages: [
				...ANSWER.stages,
				{ ...ANSWER.stages[FIRST_RECORDED_STAGE_INDEX], stage: "review" },
			],
		},
		"The answer reads stages build, review, shape, but the stages that ran are build, shape",
	],
	[
		"gives a line range that ends before it starts",
		{
			...ANSWER,
			rootCause: { ...ANSWER.rootCause, lines: { end: 2, start: 3 } },
		},
		"The line range 3-2 is not within the 3 lines of skills/build/SKILL.md as the build stage read it",
	],
	[
		"gives a line range past the end of the file",
		{
			...ANSWER,
			rootCause: { ...ANSWER.rootCause, lines: { end: 9, start: 2 } },
		},
		"The line range 2-9 is not within the 3 lines of skills/build/SKILL.md as the build stage read it",
	],
	[
		"answers outside the analysis shape",
		{ ...ANSWER, narrative: "" },
		"✖ Too small: expected string to have >=1 characters\n  → at narrative",
	],
] as const;
async function givesAStageThatNeverRanTheRoleNeverRan(): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory);

	const { record } = await analyzeRun(
		{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
		dependencies(new FakeAnalysisProvider().invoke),
	);

	const [observedFirstStage, observedSecondStage] = ANSWER.stages;

	expect(record).toMatchObject({
		stages: [
			observedFirstStage,
			observedSecondStage,
			{ role: "never ran", stage: "review" },
		],
	});
}

async function recordsAnyLineRangeInItAsAFailure(): Promise<void> {
	const directory = await runsDirectory();
	await runStoppedAtBuild(directory, {
		...CORPUS_BODIES,
		"skills/build/SKILL.md": "",
	});
	const answer = {
		...ANSWER,
		rootCause: { ...ANSWER.rootCause, lines: { end: 1, start: 1 } },
	};

	const { record } = await recordAnalysis(
		directory,
		"2026-10-04T12:00:00.000Z",
		answer,
	);

	expect(record).toMatchObject({
		outcome: "failed",
		reason:
			"The line range 1-1 is not within the 0 lines of skills/build/SKILL.md as the build stage read it",
	});
}

async function recordsALineRangeInItAsAFailure(): Promise<void> {
	const directory = await runsDirectory();
	await runWithOneGradedStage(directory);
	await writeStage(
		directory,
		stoppedStage("build", ["CLAUDE.md", "skills/build/SKILL.md"], {
			kind: "refused",
			refusal: "the layout held a symlink",
		}),
	);
	const provider = new FakeAnalysisProvider();

	const { record } = await analyzeRun(
		{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
		dependencies(provider.invoke),
	);

	expect(record).toMatchObject({
		outcome: "failed",
		reason:
			"The answer gives a line range in skills/build/SKILL.md, but the run kept no body of it as the build stage read it",
	});
}
describe(analyzeRun.name, () => {
	it(
		"gives a stage that never ran the role never ran",
		givesAStageThatNeverRanTheRoleNeverRan,
	);
	describe("when the answer breaks a rule of the analysis", () => {
		it.each(ANALYSIS_EXAMPLES_4)(
			"records the failure, its reason and its cost when it %s",
			async (_case, answer, reason) => {
				const directory = await runsDirectory();
				await runStoppedAtBuild(directory);
				const provider = new FakeAnalysisProvider();
				provider.answer(answering(answer));

				const { file, record } = await analyzeRun(
					{ capUsd: 1, model: "sonnet", run: RUN, runsDirectory: directory },
					dependencies(provider.invoke),
				);

				expect(record).toMatchObject({
					costUsd: 0.24,
					outcome: "failed",
					payload: answer,
					reason,
				});
				expect(await Bun.file(file).json()).toEqual(record);
			},
		);
	});
	describe("when the root-cause file was empty as the stage read it", () => {
		it(
			"records any line range in it as a failure",
			recordsAnyLineRangeInItAsAFailure,
		);
	});
	describe("when the run kept no body of the root-cause file", () => {
		it(
			"records a line range in it as a failure",
			recordsALineRangeInItAsAFailure,
		);
	});
});
