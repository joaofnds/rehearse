import type { JudgeResult } from "./judge";
import { JudgeOutputValidationError } from "./judge-attempt";
import JudgeAttemptBuilder from "./judge-attempt-test-builder";
import type { PipelineConfirmationDependencies } from "./pipeline-confirmation";
import {
	CONFIRMATION_METRIC,
	completeFinalGrade,
} from "./pipeline-confirmation-judging-test-fixtures";
import { repOrdinal } from "./pipeline-confirmation-workspace-test-fixture";

const AWAITED_EVENT_COUNT = 3;
const CORPUS_CAPTURE_ELAPSED_MS = 500;
const INITIAL_CLOCK_MS = 0;
const NO_CAPTURED_DISCUSSION_CORPORA = 0;
const CORPUS_CAPTURE_COUNT_INCREMENT = 1;
const THIRD_REP_ORDINAL = 3;
const SECOND_REP_ORDINAL = 2;

function finalJudgmentForRep(ordinal: number): JudgeResult {
	if (ordinal === THIRD_REP_ORDINAL) {
		throw new JudgeOutputValidationError({
			attempts: [new JudgeAttemptBuilder().build()],
			costUsd: CONFIRMATION_METRIC.costUsd,
			message: "Final Judge rejected both attempts",
			prompt: "final prompt",
		});
	}

	const acceptedAttempt = {
		costUsd: CONFIRMATION_METRIC.costUsd,
		metrics: CONFIRMATION_METRIC,
		outcome: "ACCEPTED" as const,
		payload: { summary: "pass" },
	};

	return {
		attempts:
			ordinal === SECOND_REP_ORDINAL
				? [
						{
							costUsd: 0,
							error: "metrics unavailable",
							outcome: "REJECTED" as const,
							payload: { invalid: true },
						},
						acceptedAttempt,
					]
				: [acceptedAttempt],
		costUsd: CONFIRMATION_METRIC.costUsd,
		grade: completeFinalGrade("PASS"),
		prompt: "final prompt",
	};
}

class ParallelPipelineFake {
	public readonly events = new Map<number, string[]>();
	private readonly allStarted = Promise.withResolvers<boolean>();
	private readonly release = Promise.withResolvers<boolean>();
	private readonly allCorporaCaptured = Promise.withResolvers<boolean>();
	private capturedDiscussionCorpora = NO_CAPTURED_DISCUSSION_CORPORA;
	private elapsedMs = INITIAL_CLOCK_MS;
	public readonly now = (): number => this.elapsedMs;

	public async waitForAllStarts(): Promise<void> {
		await this.allStarted.promise;
	}
	public releaseWorkers(): void {
		this.release.resolve(true);
	}

	public readonly override = (
		dependencies: PipelineConfirmationDependencies,
	): PipelineConfirmationDependencies => {
		const { stageSession } = dependencies;
		const { runWorkflowStage, captureStageCorpus } = stageSession;

		return {
			...dependencies,
			runFinalJudge: this.finalJudge,
			stageSession: {
				...stageSession,
				captureStageCorpus: async (skill, instructions, roots) => {
					const captured = await captureStageCorpus(skill, instructions, roots);
					if (skill === "discuss") {
						this.capturedDiscussionCorpora += CORPUS_CAPTURE_COUNT_INCREMENT;
						if (this.capturedDiscussionCorpora === AWAITED_EVENT_COUNT) {
							this.elapsedMs += CORPUS_CAPTURE_ELAPSED_MS;
							this.allCorporaCaptured.resolve(true);
						}

						await this.allCorporaCaptured.promise;
					}

					return captured;
				},
				runWorkflowStage: async (request) => {
					const ordinal = repOrdinal(request.targetDir);
					this.record({ event: request.stage, ordinal });
					if (request.stage === "discuss") {
						if (this.events.size === AWAITED_EVENT_COUNT) {
							this.allStarted.resolve(true);
						}

						await this.release.promise;
					}

					const result = await runWorkflowStage(request);
					return { ...result, sessionId: `${ordinal}-${request.stage}` };
				},
			},
		};
	};

	private readonly finalJudge: PipelineConfirmationDependencies["runFinalJudge"] =
		async ({ ordinal }) => {
			this.record({ event: "final", ordinal });

			return await Promise.resolve(finalJudgmentForRep(ordinal));
		};

	private record({ ordinal, event }: PipelineEvent): void {
		const events = this.events.get(ordinal) ?? [];
		events.push(event);
		this.events.set(ordinal, events);
	}
}

interface PipelineEvent {
	readonly ordinal: number;
	readonly event: string;
}

export { ParallelPipelineFake as default };
