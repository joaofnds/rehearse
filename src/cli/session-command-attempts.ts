import type { ConfirmationCostProjection } from "#benchmark/confirmation";
import { projectConfirmationCost } from "#benchmark/confirmation";
import type { ConfirmationGroupOutcome } from "#benchmark/confirmation-evidence";
import { CorpusSourceError } from "#benchmark/corpus-source";
import type {
	SessionConfirmationDependencies,
	SessionConfirmationRequest,
} from "#benchmark/session-confirmation";
import { runSessionConfirmation } from "#benchmark/session-confirmation";
import { UsageError } from "#cli/command-usage";
import corpusRefusal from "#cli/corpus-failures";
import type runSessionDebugAttempt from "#cli/session-debug-attempt";
import {
	defaultSessionRunRequest,
	reportSessionChecks,
} from "#cli/session-run-command";
import type { SessionRunRequest } from "#cli/session-run-command";

import reportConfirmationOutcome from "./confirmation-command-output";
import type {
	RunOutcome,
	SessionRunExecution,
	SessionRunExecutionDependencies,
} from "./run-command-contracts";

const SINGLE_EXECUTION_REP_COUNT = 1;

interface SessionCommandAttemptsRequest {
	readonly execution: SessionRunExecution;
	readonly dependencies: SessionRunExecutionDependencies;
	readonly runsDirectory: string;
	readonly groupId: string;
	readonly runDebug: typeof runSessionDebugAttempt;
	readonly executeAttempt: SessionConfirmationDependencies["executeAttempt"];
	readonly inFlight: SessionRunRequest["inFlight"];
}

class SessionCommandAttempts {
	public constructor(private readonly context: SessionCommandAttemptsRequest) {}
	public readonly projectCost = (
		spendCeilingUsd: number,
	): ConfirmationCostProjection =>
		projectConfirmationCost({
			judgeBudgetUsd:
				this.context.execution.sessionCase.judge === undefined
					? undefined
					: (this.context.execution.sessionCase.judge.sessionBudgetUsd ??
						this.context.execution.config.sessionBudgetUsd),
			mode: "session",
			reps:
				this.context.execution.config.confirmation?.reps ??
				SINGLE_EXECUTION_REP_COUNT,
			sessionBudgetUsd: this.context.execution.config.sessionBudgetUsd,
			spendCeilingUsd,
		});
	public readonly runConfirmed = async (
		projectedCost: ConfirmationCostProjection,
	): Promise<RunOutcome> => {
		const { config, output, sessionCase } = this.context.execution;
		const { dependencies, groupId, runsDirectory } = this.context;

		const preflight = await dependencies.probeModel(config.model);
		if (config.confirmation === undefined) {
			throw new Error(
				"Confirmed session execution requires confirmation config",
			);
		}

		if (projectedCost.preflightMaximumUsd === undefined) {
			throw new Error("Session projection requires a preflight maximum");
		}

		const request: SessionConfirmationRequest = {
			approvalMethod: config.confirmation.approval,
			corpus: config.corpus,
			effort: config.effort,
			groupId,
			model: config.model,
			preflight,
			projectedCost: {
				...projectedCost,
				preflightMaximumUsd: projectedCost.preflightMaximumUsd,
			},
			reps: config.confirmation.reps,
			runsDirectory,
			sessionBudgetUsd: config.sessionBudgetUsd,
			sessionCase,
			spendCeilingUsd: dependencies.spendCeilingUsd,
		};

		const outcome = await this.executeConfirmation(request);

		return reportConfirmationOutcome(output, outcome);
	};
	private async executeConfirmation(
		request: SessionConfirmationRequest,
	): Promise<ConfirmationGroupOutcome> {
		try {
			return await runSessionConfirmation(
				{
					executeAttempt: this.context.executeAttempt,
					resolveCorpus: this.context.dependencies.resolveCorpus,
				},
				request,
			);
		} catch (error) {
			if (error instanceof CorpusSourceError) {
				throw new UsageError(error.message);
			}

			if (error instanceof Error) {
				const refusal = corpusRefusal(error);
				if (refusal !== undefined) {
					throw refusal;
				}
			}

			throw error;
		}
	}
	public readonly runDebug = async (): Promise<RunOutcome> => {
		const { config, output, sessionCase } = this.context.execution;
		const { dependencies, runsDirectory, runDebug, inFlight } = this.context;

		await dependencies.probeModel(config.model);

		const outcome = await runDebug({
			...defaultSessionRunRequest(
				{ config, inFlight, sessionCase },
				runsDirectory,
				dependencies.spendCeilingUsd,
			),
			resolveCorpus: dependencies.resolveCorpus,
		});

		reportSessionChecks(outcome.record, output);

		return { kind: "debug", recordFile: outcome.recordFile };
	};
}

export { SessionCommandAttempts as default };
