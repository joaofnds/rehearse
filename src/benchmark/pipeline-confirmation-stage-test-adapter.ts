import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { captureStageCorpus } from "./checkpoint";
import type { CorpusMeasurement } from "./corpus-measurement";
import { CONFIRMATION_METRIC } from "./pipeline-confirmation-judging-test-fixtures";
import type { StageSessionDependencies } from "./stage-session-dependencies";
import {
	assertBuildCommitted,
	captureBuildCandidate,
	changedPathsBetween,
} from "./target";
import { commitAll, harnessResult } from "./test-support";

const SHA256_HEX_DIGITS = 64;

const assertPlanningStageCompleted: StageSessionDependencies["assertPlanningStageCompleted"] =
	async ({ targetDir, baselineSha }, { stage }) => ({
		artifact: {
			content: await Bun.file(
				join(targetDir, "backlog", "docs", "DOC-1 - spec.md"),
			).text(),
			path: "backlog/docs/DOC-1 - spec.md",
		},
		changedPaths: [],
		diff: "",
		resultSha: baselineSha,
		taskState: `${stage.name}-state`,
	});

const runWorkflowStage: StageSessionDependencies["runWorkflowStage"] = async (
	request,
) => {
	if (request.stage === "discuss") {
		await mkdir(join(request.targetDir, "backlog", "docs"), {
			recursive: true,
		});
		await Bun.write(
			join(request.targetDir, "backlog", "docs", "DOC-1 - spec.md"),
			"confirmed spec\n",
		);
	} else {
		await Bun.write(join(request.targetDir, "change.txt"), "change\n");
		await commitAll(request.targetDir, "feat: implement change");
	}

	return {
		costUsd: CONFIRMATION_METRIC.costUsd,
		exchanges: [],
		providerCalls: [{ metrics: CONFIRMATION_METRIC }],
		sessionId: request.stage,
		stage: request.stage,
	};
};

function stageSessionDefaults(): StageSessionDependencies {
	return {
		assertBuildCommitted,
		assertPlanningStageCompleted,
		captureBuildCandidate,
		captureCheckIntegrity: async () =>
			await Promise.resolve(harnessResult("PASS", "checks match")),
		captureStageCorpus,
		captureTreatmentChecks: async () =>
			await Promise.resolve(harnessResult("PASS", "all green")),
		changedPathsBetween,
		corpusVersionFiles: async () => await Promise.resolve([]),
		measureCorpus: async () =>
			await Promise.resolve<CorpusMeasurement>({
				digest: "c".repeat(SHA256_HEX_DIGITS),
				kind: "version",
			}),
		readTaskCard: async () => await Promise.resolve("confirmed task card"),
		readTaskOutput: async () =>
			await Promise.resolve(
				JSON.stringify({
					task: {
						acceptanceCriteria: ["done"],
						documentation: ["DOC-1 - spec.md"],
					},
				}),
			),
		runWorkflowStage,
	};
}

export { stageSessionDefaults as default };
