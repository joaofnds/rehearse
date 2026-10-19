import { describe, expect, it } from "bun:test";

import { diffTexts, presentAttempts } from "./attempts";
import StageAttemptBuilder from "./stage-attempt-test-builder";

const lineageInputs = {
	corpusFiles: [
		{ path: "CLAUDE.md", sha256: "aa11" },
		{ path: "skills/discuss/SKILL.md", sha256: "bb22" },
	],
	effort: "high",
	model: "sonnet",
} as const;
const refusesAttemptsWhoseModelDiffersEvenWhenTheirCorpusAlsoDiffers =
	(): void => {
		expect(
			presentAttempts(
				"lineage-1",
				[
					{
						...new StageAttemptBuilder({
							grade: "B",
							label: "original run run1",
						})
							.withArtifactContent("old\n")
							.build(),
						lineageInputs,
					},
					{
						...new StageAttemptBuilder({ grade: "A", label: "replay r2" })
							.withArtifactContent("new\n")
							.build(),
						lineageInputs: {
							...lineageInputs,
							corpusFiles: [
								{ path: "CLAUDE.md", sha256: "aa11" },
								{ path: "skills/discuss/SKILL.md", sha256: "changed" },
							],
							model: "opus",
						},
					},
				],
				diffTexts,
			),
		).rejects.toThrow(/model sonnet.*opus/u);
	};

const refusesAttemptsWhoseModelDiffersNamingTheModels = (): void => {
	expect(
		presentAttempts(
			"lineage-1",
			[
				{
					...new StageAttemptBuilder({ grade: "B", label: "original run run1" })
						.withArtifactContent("old\n")
						.build(),
					lineageInputs,
				},
				{
					...new StageAttemptBuilder({ grade: "A", label: "replay r2" })
						.withArtifactContent("new\n")
						.build(),
					lineageInputs: { ...lineageInputs, model: "opus" },
				},
			],
			diffTexts,
		),
	).rejects.toThrow(/model sonnet.*opus/u);
};

const refusesAttemptsWhoseEffortDiffersNamingTheEfforts = (): void => {
	expect(
		presentAttempts(
			"lineage-1",
			[
				{
					...new StageAttemptBuilder({ grade: "B", label: "original run run1" })
						.withArtifactContent("old\n")
						.build(),
					lineageInputs,
				},
				{
					...new StageAttemptBuilder({ grade: "A", label: "replay r2" })
						.withArtifactContent("new\n")
						.build(),
					lineageInputs: { ...lineageInputs, effort: "low" },
				},
			],
			diffTexts,
		),
	).rejects.toThrow(/effort high.*low/u);
};

const namesTheAttemptsWhoseLineagesDisagree = (): void => {
	expect(
		presentAttempts(
			"lineage-1",
			[
				{
					...new StageAttemptBuilder({ grade: "B", label: "original run run1" })
						.withArtifactContent("old\n")
						.build(),
					lineageInputs,
				},
				{
					...new StageAttemptBuilder({ grade: "A", label: "replay r2" })
						.withArtifactContent("new\n")
						.build(),
					lineageInputs: { ...lineageInputs, model: "opus" },
				},
			],
			diffTexts,
		),
	).rejects.toThrow(/original run run1.*replay r2/u);
};

const refusesALaterAttemptThatDisagreesWithOnesBeforeIt = (): void => {
	expect(
		presentAttempts(
			"lineage-1",
			[
				{
					...new StageAttemptBuilder({ grade: "B", label: "replay r1" })
						.withArtifactContent("one\n")
						.build(),
					lineageInputs,
				},
				{
					...new StageAttemptBuilder({ grade: "B", label: "replay r2" })
						.withArtifactContent("two\n")
						.build(),
					lineageInputs,
				},
				{
					...new StageAttemptBuilder({ grade: "A", label: "replay r3" })
						.withArtifactContent("three\n")
						.build(),
					lineageInputs: { ...lineageInputs, model: "opus" },
				},
			],
			diffTexts,
		),
	).rejects.toThrow(/replay r3/u);
};
describe(presentAttempts.name, () => {
	it(
		"refuses attempts whose model differs even when their corpus also differs",
		refusesAttemptsWhoseModelDiffersEvenWhenTheirCorpusAlsoDiffers,
	);
	it(
		"refuses attempts whose model differs, naming the models",
		refusesAttemptsWhoseModelDiffersNamingTheModels,
	);
	it(
		"refuses attempts whose effort differs, naming the efforts",
		refusesAttemptsWhoseEffortDiffersNamingTheEfforts,
	);
	it(
		"names the attempts whose lineages disagree",
		namesTheAttemptsWhoseLineagesDisagree,
	);
	it(
		"refuses a later attempt that disagrees with ones before it",
		refusesALaterAttemptThatDisagreesWithOnesBeforeIt,
	);
});
