import { join } from "node:path";

import { z } from "zod";

import { humanReviewSchema } from "#benchmark/contracts";
import type { HumanReview } from "#benchmark/human-review-contract";
import { runJudge } from "#benchmark/judge";
import { benchmarkRunPaths } from "#benchmark/run-layout";
import { runStageJudge } from "#benchmark/stage-grading";
import type {
	CalibrateDependencies,
	CurrentControlSources,
} from "#cli/calibrate-command";
import { RUN_NAME } from "#cli/calibrate-test-support";
import type { CliTestWorkspace } from "#cli/cli-test-support";

const calibrationByteFixtureUrl = new URL(
	"__fixtures__/calibration-bytes/inputs.json",
	import.meta.url,
);

const byteSourcesSchema = z.object({
	finalRubric: z.string(),
	instructions: z.string(),
});

const byteFixtureSchema = z.object({
	final: z.unknown(),
	manifest: z.unknown(),
	review: z.unknown(),
	rubric: z.string(),
	scorecard: z.unknown(),
	sources: byteSourcesSchema,
	stage: z.unknown(),
});

async function calibrationByteSources(
	caseId: string | undefined,
): Promise<CurrentControlSources> {
	const seed = byteFixtureSchema.parse(
		await Bun.file(calibrationByteFixtureUrl).json(),
	);
	return caseId === undefined
		? { ...seed.sources, finalRubric: "" }
		: seed.sources;
}

interface CalibrationByteScenario {
	readonly kind: "stage" | "final";
	readonly rejudge: boolean;
}

async function writeCalibrationByteFixture(
	{ kind, rejudge }: CalibrationByteScenario,
	workspace: Readonly<CliTestWorkspace>,
): Promise<{
	readonly directory: string;
	readonly recordFile: string;
}> {
	const directory = await workspace.createDirectory(
		"rehearse-calibration-bytes-",
	);
	const text = await Bun.file(calibrationByteFixtureUrl).text();
	const seed = byteFixtureSchema.parse(
		JSON.parse(text.replaceAll("__RUNS__", directory)),
	);
	const paths = benchmarkRunPaths(directory, RUN_NAME);
	const recordFile =
		kind === "stage" ? paths.stageFile("shape") : paths.artifactFile;
	const review = rejudge
		? revisedByteReview(humanReviewSchema.parse(seed.review))
		: seed.review;
	await Promise.all([
		Bun.write(paths.manifestFile, JSON.stringify(seed.manifest)),
		Bun.write(
			join(directory, "shape.json"),
			rejudge ? seed.rubric.replace("Scope", "Revised scope") : seed.rubric,
		),
		Bun.write(paths.reviewFile, JSON.stringify(review)),
		Bun.write(recordFile, JSON.stringify(seed[kind])),
	]);

	if (kind === "final") {
		await Bun.write(paths.stageFile("shape"), JSON.stringify(seed.scorecard));
	}

	return { directory, recordFile };
}

function revisedByteReview(
	review: HumanReview,
): z.infer<typeof humanReviewSchema> {
	return {
		...review,
		findings: [
			{
				description: "Reviewed scope",
				judgeAssessment: "NOT_PROMOTED",
				paths: ["context.md"],
				rubricId: null,
				stage: "shape",
			},
		],
	};
}

async function revisedCalibrationByteSources(
	caseId: string | undefined,
): Promise<CurrentControlSources> {
	const sources = await calibrationByteSources(caseId);
	return {
		finalRubric: sources.finalRubric.replace(
			"Worker changes",
			"Revised worker changes",
		),
		instructions: "Revised instructions",
	};
}

const byteRejudges: CalibrateDependencies["buildJudges"] = (
	knobs,
	spendCeiling,
) => {
	if (knobs.sessionBudgetUsd === undefined) {
		throw new Error("fixture omitted its recorded session budget");
	}
	const execution = {
		budget: { sessionBudgetUsd: knobs.sessionBudgetUsd, spendCeiling },
		effort: knobs.judgeEffort,
		model: knobs.judgeModel,
	};
	return {
		finalJudge: async (rubric, candidate) =>
			await runJudge(
				execution,
				{ ...candidate, rubric },
				async () =>
					await Bun.file(
						new URL(
							"__fixtures__/calibration-bytes/final-response.json",
							import.meta.url,
						),
					).text(),
			),
		stageJudge: async (scorecard, source) =>
			await runStageJudge(
				execution,
				{ evidenceOrigin: "record", input: scorecard.input, source },
				{
					invoke: async () =>
						await Bun.file(
							new URL(
								"../benchmark/__fixtures__/judge-prompts/stage-response.json",
								import.meta.url,
							),
						).text(),
				},
			),
	};
};

export {
	byteRejudges,
	calibrationByteSources,
	revisedCalibrationByteSources,
	writeCalibrationByteFixture,
};
