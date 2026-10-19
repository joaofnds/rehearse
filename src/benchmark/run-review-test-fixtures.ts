import { expect } from "bun:test";

import type { CalibrationResult, GradedRunArtifact } from "./contracts";
import type { JudgeAgreementReport } from "./judge-agreement";
import { buildRunArtifact } from "./run-artifact";
import RunArtifactInputsBuilder from "./run-artifact-inputs-builder";
import type {
	FinishGradedRunDependencies,
	FinishGradedRunRequest,
} from "./run-review-completion";
import { TEST_TARGET } from "./test-support";

interface FinishHarness {
	readonly order: string[];
	readonly dependencies: FinishGradedRunDependencies;
}
function fakeFinish(): FinishHarness {
	const order: string[] = [];

	return {
		dependencies: {
			awaitArtifactReview: async () => {
				order.push("await-review");

				await Promise.resolve();
			},
			collectCalibration: async () => {
				order.push("calibrate");

				return await Promise.reject(
					new Error("no calibration without a pause"),
				);
			},
			collectJudgeAgreement: async () => {
				order.push("agreement");

				return await Promise.reject(new Error("no agreement without a pause"));
			},
			completeArtifact: async () => {
				order.push("complete");

				await Promise.resolve();
			},
			log: (message) => {
				expect(message).toContain("removing the run's checkout");
			},
			recordRetentionRef: async (_targetDir, runName, sha) => {
				order.push(`retain:${runName}:${sha}`);

				await Promise.resolve();
			},
		},
		order,
	};
}
const finishRequest: FinishGradedRunRequest = {
	artifact: buildRunArtifact(
		new RunArtifactInputsBuilder()
			.withPipeline(
				{
					stages: [],
					statuses: ["To Do", "Done"],
					target: TEST_TARGET,
				},
				"pipelines/default.json",
			)
			.build(),
	),
	calibrationInput: {
		finalRubricPath: "/control/rubric.md",
		originalInstructions: "Instructions",
		originalRubric: "Rubric",
		rubricsDirectory: "/control/rubrics",
		stageScorecards: [],
	},
	pause: false,
	resultSha: "candidate-sha",
	runName: "2026-09-03T00-00-00.000Z",
	targetDir: "/tmp/target",
};

class CalibratedFinishFixture {
	public readonly order = fakeFinish().order;
	public readonly calibration: CalibrationResult = {
		humanReview: { findings: [], summary: "failed", verdict: "REJECT" },
		instructionsChanged: false,
		rubricChanged: false,
		stageRubricsChanged: [],
	};
	public readonly judgeAgreement: JudgeAgreementReport = {
		baselines: [],
		skippedCalibrations: 0,
	};
	public readonly completed: GradedRunArtifact[] = [];
	public readonly dependencies: FinishGradedRunDependencies = {
		awaitArtifactReview: async () => {
			this.order.push("await-review");
			await Promise.resolve();
		},
		collectCalibration: async () => {
			this.order.push("calibrate");
			return await Promise.resolve(this.calibration);
		},
		collectJudgeAgreement: async () => {
			this.order.push("agreement");
			return await Promise.resolve(this.judgeAgreement);
		},
		completeArtifact: async (artifact) => {
			this.order.push("complete");
			this.completed.push(artifact);
			await Promise.resolve();
		},
		log: (message) => {
			expect(message).toContain("removing the run's checkout");
		},
		recordRetentionRef: async () => {
			this.order.push("retain");
			await Promise.resolve();
		},
	};
}
export { CalibratedFinishFixture, fakeFinish, finishRequest };
