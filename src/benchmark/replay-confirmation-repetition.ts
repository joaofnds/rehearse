import { mkdir } from "node:fs/promises";

import type { ConfirmationRepResult } from "./confirmation-evidence";
import { JudgeOutputValidationError } from "./judge-attempt";
import { readFailedReplayEvidence } from "./replay-confirmation-failure-record";
import ReplayStagePreparation from "./replay-confirmation-preparation";
import ReplayRepRecording from "./replay-confirmation-recording";
import type {
	ReplayRepContext,
	ReplayRepInput,
} from "./replay-confirmation-runtime";
import {
	captureFrozenReplayReads,
	executeFrozenReplayStage,
} from "./replay-confirmation-stage-execution";
import type { StageSessionResult } from "./stage-session-contract";

class ReplayRepetition {
	readonly #context: ReplayRepContext;
	readonly #preparation: ReplayStagePreparation;
	readonly #recording: ReplayRepRecording;
	#session: StageSessionResult | undefined;
	#judgedReads: Awaited<ReturnType<typeof captureFrozenReplayReads>> = [];
	public constructor(context: ReplayRepContext) {
		this.#context = context;
		this.#preparation = new ReplayStagePreparation(context);
		this.#recording = new ReplayRepRecording(context);
	}
	public async run(): Promise<ConfirmationRepResult> {
		try {
			return await this.completeStage();
		} catch (error) {
			const failure = error instanceof Error ? error : new Error(String(error));
			return await this.failed(failure);
		} finally {
			await this.#context.services.stop();
		}
	}
	private async completeStage(): Promise<ConfirmationRepResult> {
		const {
			dependencies,
			request,
			spendCeiling,
			runtime: { frozen, now },
		} = this.#context;
		const prepared = await this.#preparation.prepare();
		this.#session = await executeFrozenReplayStage(this.#context, prepared);
		this.#judgedReads = await captureFrozenReplayReads(
			this.#context,
			prepared,
			this.#session,
		);
		const scorecard = await dependencies.runStageJudge(
			{
				budget: {
					sessionBudgetUsd: request.sessionBudgetUsd,
					spendCeiling,
				},
				effort: request.judgeEffort,
				model: request.judgeModel,
			},
			{ input: this.#session.input, source: frozen.rubric },
		);
		const stageElapsedMs = now() - prepared.stageStart;
		return await this.#recording.completed({
			productOwner: prepared.productOwner,
			readManifest: this.#judgedReads,
			scorecard,
			session: this.#session,
			stageElapsedMs,
		});
	}
	private async failed(
		failure: Readonly<Error>,
	): Promise<ConfirmationRepResult> {
		const { now } = this.#context.runtime;
		const progress = this.#preparation.snapshot();
		const diagnosticError =
			progress.operation === undefined
				? failure.message
				: `${progress.operation} failed: ${failure.message}`;
		if (
			failure instanceof JudgeOutputValidationError &&
			progress.worktreeCreated &&
			this.#session !== undefined &&
			progress.productOwner !== undefined
		) {
			return await this.#recording.rejected(failure, {
				productOwner: progress.productOwner,
				readManifest: this.#judgedReads,
				session: this.#session,
				stageStart: progress.stageStart,
			});
		}

		const stageEvidence = readFailedReplayEvidence(failure, {
			now,
			productOwner: progress.productOwner,
			session: this.#session,
			stageStart: progress.stageStart,
		});
		return await this.#recording.diagnostic(
			diagnosticError,
			stageEvidence,
			progress.worktreeCreated,
		);
	}
}
async function runReplayRep(
	input: ReplayRepInput,
	plan: ReplayRepContext["plan"],
): Promise<ConfirmationRepResult> {
	const {
		dependencies,
		request,
		runtime: { paths, now },
		repSpendCeiling,
	} = input;
	const services = dependencies.services({
		attempt: plan.repId,
		run: request.groupId,
	});
	const repPaths = paths.rep(plan.repId);
	await mkdir(repPaths.stagesDirectory, { recursive: true });
	const repStart = now();
	const spendCeiling = repSpendCeiling();
	const repetition = new ReplayRepetition({
		...input,
		paths: repPaths,
		plan,
		repStart,
		services,
		spendCeiling,
	});
	return await repetition.run();
}
export default runReplayRep;
