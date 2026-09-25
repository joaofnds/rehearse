import type { HashedFile } from "./checkpoint";
import type { CorpusMeasurement } from "./corpus-measurement";
import type { Effort, WorkflowStage } from "./config";
import type {
	FailedJudgeRunArtifact,
	RunArtifact,
	StageJudgeInput,
	StageJudgeRecord,
	StageLetterGrade,
	StageScorecard,
} from "./contracts";
import type { JudgeAttempt } from "./judge-attempt";
import type { ReadManifestEntry } from "./read-manifest";
import type { RunEventRecorder } from "./run-events";
import type { ProductOwnerSnapshot } from "./workflow";

export interface PendingStage {
	readonly file: string;
	readonly stage: WorkflowStage;
	readonly input: StageJudgeInput;
	readonly model?: string | undefined;
	readonly effort?: Effort | undefined;
	readonly judgeModel?: string | undefined;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd?: number | undefined;
	readonly corpusFiles?: readonly HashedFile[] | undefined;
	readonly corpusVersion?: CorpusMeasurement | undefined;
	readonly readManifest?: readonly ReadManifestEntry[] | undefined;
	readonly failure?:
		| {
				readonly prompt: string;
				readonly attempts: readonly JudgeAttempt[];
				readonly costUsd: number;
		  }
		| undefined;
	readonly scorecard?: StageScorecard | undefined;
	readonly stopped?: StoppedStageReadings | undefined;
}

/**
 * What a stop record needs beyond the scorecard to be read without its run's
 * other files: the grade it fell below, the stage's and the run's elapsed time, and the
 * Product Owner's spend up to the stop, which no other record holds.
 */
export interface StoppedStageReadings {
	readonly minimumGrade: StageLetterGrade;
	readonly elapsedMs?: number | undefined;
	readonly runElapsedMs?: number | undefined;
	readonly productOwner: ProductOwnerSnapshot;
}

export const noopRunEventRecorder: RunEventRecorder = {
	record: () => undefined,
};

export interface RunAbortDependencies {
	readonly killActiveCommands: () => Promise<void>;
	readonly registerSignal: (
		signal: NodeJS.Signals,
		handler: (signal: NodeJS.Signals) => void,
	) => void;
	readonly releaseSignal: (
		signal: NodeJS.Signals,
		handler: (signal: NodeJS.Signals) => void,
	) => void;
	readonly exit: (code: number) => void;
	readonly reportError: (message: string) => void;
	readonly persistence: RunArtifactPersistence;
	readonly runEvents?: RunEventRecorder | undefined;
	/**
	 * Milliseconds elapsed since the run started, not a raw clock: the caller
	 * owns the one origin a run has, so this and workflow.ts's WorkflowStageRequest
	 * carry the same shape rather than each capturing its own `Date.now()` at
	 * construction. Two independent origins previously made elapsed time jump
	 * backward at every stage boundary.
	 */
	readonly elapsedMs?: (() => number) | undefined;
}

export interface RunAbortRequest {
	readonly artifactFile: string;
	readonly teardown: () => Promise<void>;
}

export interface RunAbort {
	readonly writePendingStage: (pending: PendingStage) => Promise<void>;
	readonly updatePendingStage: (pending: PendingStage) => void;
	readonly writeStageProgress: (record: StageJudgeRecord) => Promise<void>;
	readonly completeStage: (record: StageJudgeRecord) => Promise<void>;
	readonly writePendingArtifact: (artifact: RunArtifact) => Promise<void>;
	readonly completeArtifact: (artifact: RunArtifact) => Promise<void>;
	readonly awaitArtifactReview: () => Promise<void>;
	readonly writeFailedArtifact: (
		artifact: FailedJudgeRunArtifact,
	) => Promise<void>;
	readonly markAborted: (reason: string) => Promise<void>;
	readonly teardown: () => Promise<void>;
	readonly release: () => void;
}

const RUN_SIGNALS: readonly NodeJS.Signals[] = ["SIGINT", "SIGTERM", "SIGHUP"];

/**
 * The event store is derived and disposable (GLOSSARY.md: "the run artifact
 * on disk remains authoritative"), so a failure recording to it must never
 * block or skip the authoritative write it accompanies.
 */
function recordRunEvent(
	reportError: (message: string) => void,
	record: () => void,
): void {
	try {
		record();
	} catch (error) {
		reportError(
			`Failed to record run event: ${error instanceof Error ? error.message : String(error)}`,
		);
	}
}

export interface RunArtifactPersistence {
	readonly write: (path: string, contents: string) => Promise<void>;
}

export const fileRunArtifactPersistence: RunArtifactPersistence = {
	write: async (path, contents) => {
		await Bun.write(path, contents);
	},
};

function totalSpentUsd(artifact: RunArtifact): number {
	return (
		artifact.workflow.reduce((total, stage) => total + stage.costUsd, 0) +
		artifact.stageScorecards.reduce(
			(total, stage) => total + stage.costUsd,
			0,
		) +
		artifact.productOwnerCostUsd +
		artifact.judgeCostUsd
	);
}

function signalExitCode(signal: NodeJS.Signals): number {
	if (signal === "SIGTERM") {
		return 143;
	}
	if (signal === "SIGHUP") {
		return 129;
	}

	return 130;
}

export async function writeRunArtifact(
	path: string,
	artifact: RunArtifact,
	persistence: RunArtifactPersistence = fileRunArtifactPersistence,
): Promise<void> {
	await persistence.write(path, `${JSON.stringify(artifact, null, 2)}\n`);
}

export async function writeStageJudgeFailure(
	pending: PendingStage,
	reason: string,
	persistence: RunArtifactPersistence = fileRunArtifactPersistence,
): Promise<void> {
	const findings = pending.scorecard
		? {
				hardBlockers: pending.scorecard.grade.hardBlockers,
				requirements: pending.scorecard.grade.requirements,
				dimensions: pending.scorecard.grade.dimensions,
				summary: pending.scorecard.grade.summary,
				grade: {
					grade: pending.scorecard.grade.grade,
					verdict: pending.scorecard.grade.verdict,
				},
				attempts: pending.scorecard.attempts,
				costUsd: pending.scorecard.costUsd,
			}
		: undefined;
	const stopped =
		pending.stopped === undefined
			? undefined
			: {
					minimumGrade: pending.stopped.minimumGrade,
					elapsedMs: pending.stopped.elapsedMs,
					runElapsedMs: pending.stopped.runElapsedMs,
					productOwnerCostUsd: pending.stopped.productOwner.spentUsd,
					productOwnerProviderCalls: pending.stopped.productOwner.providerCalls,
				};
	await persistence.write(
		pending.file,
		`${JSON.stringify(
			{
				status: "STAGE_JUDGE_FAILED",
				stage: pending.stage,
				error: reason,
				input: pending.input,
				corpusFiles: pending.corpusFiles,
				corpusVersion: pending.corpusVersion,
				readManifest: pending.readManifest,
				model: pending.model,
				effort: pending.effort,
				judgeModel: pending.judgeModel,
				judgeEffort: pending.judgeEffort,
				sessionBudgetUsd: pending.sessionBudgetUsd,
				...findings,
				...stopped,
				...pending.failure,
			},
			null,
			2,
		)}\n`,
	);
}

export function createRunAbort(
	dependencies: RunAbortDependencies,
	request: RunAbortRequest,
): RunAbort {
	let pendingArtifact: RunArtifact | undefined;
	let pendingStage: PendingStage | undefined;
	let terminalEventRecorded = false;
	let abortRecorded: Promise<void> | undefined;
	let teardownStarted: Promise<void> | undefined;
	let signalAbortStarted = false;
	let abortRequested = false;
	let transitionReady = Promise.resolve();
	const runEvents = dependencies.runEvents ?? noopRunEventRecorder;
	const elapsedMs = dependencies.elapsedMs ?? (() => 0);

	const enqueueTransition = async (
		transition: () => Promise<void>,
	): Promise<void> => {
		const previousTransition = transitionReady;
		const currentTransition = Promise.withResolvers<undefined>();
		transitionReady = currentTransition.promise;
		await previousTransition;

		try {
			await transition();
		} finally {
			currentTransition.resolve(undefined);
		}
	};
	const enqueueNormalTransition = (
		transition: () => Promise<void>,
	): Promise<void> => {
		if (abortRequested) {
			return Promise.resolve();
		}

		return enqueueTransition(async () => {
			if (!abortRequested) {
				await transition();
			}
		});
	};
	const writePendingStage = (pending: PendingStage): Promise<void> => {
		if (abortRequested) {
			return Promise.resolve();
		}

		pendingStage = pending;

		return enqueueNormalTransition(async () => {
			recordRunEvent(dependencies.reportError, () => {
				runEvents.record(
					"stage-judging",
					pending.stage,
					pending.input.transcript.costUsd,
					elapsedMs(),
				);
			});
			await dependencies.persistence.write(
				pending.file,
				`${JSON.stringify(
					{
						status: "AWAITING_STAGE_JUDGE",
						stage: pending.stage,
						input: pending.input,
						corpusVersion: pending.corpusVersion,
						model: pending.model,
						effort: pending.effort,
						judgeModel: pending.judgeModel,
						judgeEffort: pending.judgeEffort,
						sessionBudgetUsd: pending.sessionBudgetUsd,
					},
					null,
					2,
				)}\n`,
			);
		});
	};
	const writeStageProgress = (record: StageJudgeRecord): Promise<void> => {
		if (abortRequested) {
			return Promise.resolve();
		}
		if (pendingStage === undefined) {
			return Promise.reject(new Error("No stage transition is pending"));
		}

		const { file } = pendingStage;

		return enqueueNormalTransition(() =>
			dependencies.persistence.write(
				file,
				`${JSON.stringify(record, null, 2)}\n`,
			),
		);
	};
	const completeStage = (record: StageJudgeRecord): Promise<void> => {
		if (abortRequested) {
			return Promise.resolve();
		}
		if (pendingStage === undefined) {
			return Promise.reject(new Error("No stage transition is pending"));
		}

		const { file, stage } = pendingStage;

		return enqueueNormalTransition(async () => {
			recordRunEvent(dependencies.reportError, () => {
				runEvents.record(
					"stage-completed",
					stage,
					record.input.transcript.costUsd + record.costUsd,
					elapsedMs(),
				);
			});
			await dependencies.persistence.write(
				file,
				`${JSON.stringify(record, null, 2)}\n`,
			);
			pendingStage = undefined;
		});
	};
	const writePendingArtifact = (artifact: RunArtifact): Promise<void> => {
		if (abortRequested) {
			return Promise.resolve();
		}

		pendingArtifact = artifact;

		return enqueueNormalTransition(() =>
			writeRunArtifact(
				request.artifactFile,
				artifact,
				dependencies.persistence,
			),
		);
	};
	const completeArtifact = (artifact: RunArtifact): Promise<void> => {
		if (abortRequested) {
			return Promise.resolve();
		}

		pendingArtifact = artifact;

		return enqueueNormalTransition(async () => {
			await writeRunArtifact(
				request.artifactFile,
				artifact,
				dependencies.persistence,
			);
			recordRunEvent(dependencies.reportError, () => {
				runEvents.record(
					"run-completed",
					"",
					totalSpentUsd(artifact),
					elapsedMs(),
				);
			});
			terminalEventRecorded = true;
			pendingArtifact = undefined;
		});
	};
	/**
	 * The artifact is finished at AWAITING_HUMAN_REVIEW and no further
	 * transition is coming, so it stops being pending. Without this the
	 * restore that follows is a window in which a signal rewrites a fully
	 * graded artifact FAILED, and `calibrate` reads only AWAITING_HUMAN_REVIEW.
	 */
	const awaitArtifactReview = (): Promise<void> =>
		enqueueNormalTransition(() => {
			const artifact = pendingArtifact;
			if (artifact !== undefined) {
				recordRunEvent(dependencies.reportError, () => {
					runEvents.record(
						"run-completed",
						"",
						totalSpentUsd(artifact),
						elapsedMs(),
					);
				});
				terminalEventRecorded = true;
			}
			pendingArtifact = undefined;

			return Promise.resolve();
		});
	const writeFailedArtifact = (
		artifact: FailedJudgeRunArtifact,
	): Promise<void> => {
		pendingArtifact = artifact;

		return enqueueTransition(async () => {
			await writeRunArtifact(
				request.artifactFile,
				artifact,
				dependencies.persistence,
			);
			recordRunEvent(dependencies.reportError, () => {
				runEvents.record(
					"run-failed",
					"",
					totalSpentUsd(artifact),
					elapsedMs(),
				);
			});
			terminalEventRecorded = true;
			pendingArtifact = undefined;
		});
	};
	const markAborted = (reason: string): Promise<void> => {
		if (abortRecorded === undefined) {
			abortRequested = true;
			const stageToFail = pendingStage;
			const artifactToFail = pendingArtifact;
			abortRecorded = enqueueTransition(async () => {
				if (!terminalEventRecorded) {
					recordRunEvent(dependencies.reportError, () => {
						runEvents.record(
							"run-failed",
							stageToFail?.stage ?? "",
							artifactToFail === undefined
								? (stageToFail?.input.transcript.costUsd ?? 0)
								: totalSpentUsd(artifactToFail),
							elapsedMs(),
						);
					});
					terminalEventRecorded = true;
				}
				if (stageToFail !== undefined) {
					try {
						await writeStageJudgeFailure(
							stageToFail,
							reason,
							dependencies.persistence,
						);
					} catch (error) {
						dependencies.reportError(
							`Failed to update run artifacts: ${error instanceof Error ? error.message : String(error)}`,
						);
					}
				}
				if (artifactToFail !== undefined) {
					try {
						await writeRunArtifact(
							request.artifactFile,
							{
								...artifactToFail,
								status: "FAILED",
							},
							dependencies.persistence,
						);
					} catch (error) {
						dependencies.reportError(
							`Failed to update run artifacts: ${error instanceof Error ? error.message : String(error)}`,
						);
					}
				}
			});
		}

		return abortRecorded;
	};
	const teardown = (): Promise<void> => {
		teardownStarted ??= request.teardown();

		return teardownStarted;
	};
	const attemptRecovery = async (
		recover: () => Promise<void>,
	): Promise<void> => {
		try {
			await recover();
		} catch (error) {
			dependencies.reportError(
				error instanceof Error ? error.message : String(error),
			);
		}
	};
	const abortAndExit = async (signal: NodeJS.Signals): Promise<void> => {
		if (teardownStarted === undefined) {
			await attemptRecovery(dependencies.killActiveCommands);
		}
		await markAborted(`run interrupted by ${signal}`);
		await attemptRecovery(teardown);
		dependencies.exit(signalExitCode(signal));
	};
	const restoreOnSignal = (signal: NodeJS.Signals): void => {
		dependencies.reportError(
			`\nReceived ${signal}; restoring the target before exit.`,
		);
		if (signalAbortStarted) {
			return;
		}

		signalAbortStarted = true;
		void abortAndExit(signal);
	};
	const release = (): void => {
		for (const signal of RUN_SIGNALS) {
			dependencies.releaseSignal(signal, restoreOnSignal);
		}
	};

	for (const signal of RUN_SIGNALS) {
		dependencies.registerSignal(signal, restoreOnSignal);
	}

	return {
		writePendingStage,
		updatePendingStage: (pending) => {
			if (!abortRequested) {
				pendingStage = pending;
			}
		},
		writeStageProgress,
		completeStage,
		writePendingArtifact,
		completeArtifact,
		awaitArtifactReview,
		writeFailedArtifact,
		markAborted,
		teardown,
		release,
	};
}
