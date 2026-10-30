import { randomUUID } from "node:crypto";

import type { Immutable } from "./contracts";
import { stageRubricSha256 } from "./judge-agreement";
import type { ReplayExecutionContext, ReplayOutcome } from "./replay-contract";
import type { PreparedReplayStage } from "./replay-preparation";
import ReplayRecording from "./replay-recording";
import type { GradedReplayStage } from "./replay-recording";
import { corpusSourceDirectories, recordStageReads } from "./stage-reads";
import {
	executeStageSession,
	stageSessionsWithServices,
} from "./stage-session";

/**
 * A replayed stage validates against the worktree's detached HEAD: main
 * cannot be checked out twice, and the primary checkout must stay untouched.
 */
function detachedStageDependencies(
	base: ReplayExecutionContext["dependencies"]["stageSession"],
): ReplayExecutionContext["dependencies"]["stageSession"] {
	return {
		...base,
		assertBuildCommitted: async (
			{ targetDir, taskSha },
			_branch,
			commitSubjectPattern,
		) =>
			await base.assertBuildCommitted(
				{ targetDir, taskSha },
				null,
				commitSubjectPattern,
			),
		assertPlanningStageCompleted: async (
			{ targetDir, baselineSha: taskSha },
			{ stage, taskState },
		) =>
			await base.assertPlanningStageCompleted(
				{ baselineSha: taskSha, targetDir },
				{ expectedBranch: null, stage, taskState },
			),
	};
}
class ReplayStageExecution {
	readonly #context: ReplayExecutionContext;
	readonly #prepared: PreparedReplayStage;
	public constructor(
		context: ReplayExecutionContext,
		prepared: PreparedReplayStage,
	) {
		this.#context = context;
		this.#prepared = prepared;
	}
	public async run(): Promise<ReplayOutcome> {
		const {
			dependencies,
			request,
			inputs: { plan },
		} = this.#context;
		const { spendCeiling, now, stageStartedAtMs } = this.#prepared;
		const session = await this.session();
		const rubric = await dependencies.loadStageRubric(plan.definition);
		const readManifest = await this.reads(session, rubric);
		dependencies.log(`\n${request.stage} stage Judge`);
		const scorecard = await dependencies.runStageJudge(
			{
				budget: { sessionBudgetUsd: request.sessionBudgetUsd, spendCeiling },
				effort: request.judgeEffort,
				model: request.judgeModel,
			},
			{ input: session.input, source: rubric },
		);
		const elapsedMs = now() - stageStartedAtMs;
		return await new ReplayRecording(this.#context, this.#prepared).save({
			elapsedMs,
			readManifest,
			scorecard,
			session,
		});
	}
	private async session(): Promise<GradedReplayStage["session"]> {
		const {
			dependencies,
			request,
			inputs: { manifest, plan },
			lifetime: { worktreeDir },
		} = this.#context;
		const {
			environment,
			baselineContext,
			baselineHashes,
			baselineSha: baseSha,
			corpusRoots,
			productOwner,
			spendCeiling,
			priorArtifacts,
		} = this.#prepared;
		return await executeStageSession(
			detachedStageDependencies(
				stageSessionsWithServices(dependencies.stageSession, environment),
			),
			{
				baselineContext,
				baselineHashes,
				baselineSha: baseSha,
				commitSubjectPattern: manifest.pipeline.commitSubjectPattern,
				corpusRoots,
				effort: request.effort,
				instructions: request.instructions,
				model: request.model,
				productBrief: manifest.productBrief,
				productOwner,
				sessionBudgetUsd: request.sessionBudgetUsd,
				sessionId: randomUUID(),
				settingsOverlay: request.loadedSettings?.json,
				setup: request.setup,
				spendCeiling,
				target: manifest.pipeline.target,
				targetDir: worktreeDir,
				task: manifest.task,
				taskId: manifest.taskId,
				taskSha: baseSha,
			},
			{ definition: plan.definition, priorArtifacts },
		);
	}
	private async reads(
		session: GradedReplayStage["session"],
		rubric: Immutable<
			Awaited<
				ReturnType<ReplayExecutionContext["dependencies"]["loadStageRubric"]>
			>
		>,
	): Promise<GradedReplayStage["readManifest"]> {
		const {
			dependencies,
			request,
			inputs: { plan },
			lifetime: { worktreeDir },
		} = this.#context;
		const { baselineSha: baseSha } = this.#prepared;
		return await recordStageReads({
			corpusFiles: session.corpusFiles,
			corpusSources:
				request.corpusSource.kind === "directory"
					? []
					: corpusSourceDirectories(request.corpusSource),
			rubric: {
				path: plan.definition.rubric,
				sha256: stageRubricSha256(rubric.rubric),
			},
			skill: plan.definition.skill,
			startSha: baseSha,
			targetDir: worktreeDir,
			transcript:
				dependencies.projectsDirectory === undefined
					? undefined
					: {
							projectsDirectory: dependencies.projectsDirectory,
							sessionId: session.transcript.sessionId,
						},
			versionFiles: session.versionFiles,
		});
	}
}
export { ReplayStageExecution as default, detachedStageDependencies };
