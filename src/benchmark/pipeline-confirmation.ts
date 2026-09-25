import type { CorpusRoot } from "./corpus-file";
import type { CorpusMeasurement } from "./corpus-measurement";
import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import type { seedTaskBoard } from "./backlog";
import type {
	CheckpointRecord,
	HashedFile,
	installStageCorpusSnapshot,
	materializeCheckpoint,
	recordCheckpoint,
} from "./checkpoint";
import {
	hashArtifacts,
	hashWorkflowState,
	initialCheckpointInputs,
	snapshotStageCorpus,
} from "./checkpoint";
import type { LoadedStageSettings } from "./stage-settings";
import type {
	captureBaselineContext,
	captureFileHashes,
	runChecks,
} from "./checks";
import type { Effort } from "./config";
import type {
	ContextFile,
	ProviderCall,
	StageRubric,
	StageScorecard,
} from "./contracts";
import type { JudgeResult } from "./judge";
import {
	JudgeExecutionError,
	JudgeOutputValidationError,
} from "./judge-attempt";
import type { PipelineDefinition, TargetCheck } from "./pipeline";
import type { ConfirmationCostProjection } from "./confirmation";
import { runConfirmation } from "./confirmation";
import type { ConfirmationRepRecord } from "./confirmation-record";
import { confirmationRepRecordSchema } from "./confirmation-record";
import type {
	ConfirmationRepResult,
	FrozenFile,
} from "./confirmation-evidence";
import {
	collectConfirmationMetrics,
	finalizeConfirmationGroup,
	frozenDirectoryFiles,
	settleCompletedConfirmationRep,
	settleDiagnosticConfirmationRep,
	writeFrozenFile,
} from "./confirmation-evidence";
import { detachedStageDependencies } from "./replay";
import type {
	BuildEvidence,
	StageSessionDependencies,
	StageSessionResult,
} from "./run";
import { executeStageSession } from "./run";
import { confirmationGroupPaths } from "./run-layout";
import type {
	addWorktree,
	captureBuildCandidate,
	recordRetentionRef,
	removeWorktree,
	SourceBaseline,
} from "./target";
import type { ProductOwner, createProductOwner } from "./workflow";
import { WorkflowExecutionError } from "./workflow";
import { claimShortId } from "./short-id";
import { stageRubricSha256 } from "./judge-agreement";
import { recordStageReads } from "./stage-reads";

interface LoadedStageRubric {
	readonly rubricPath: string;
	readonly content: string;
	readonly rubric: StageRubric;
}

export interface PipelineFinalJudgeRequest {
	readonly repId: string;
	readonly ordinal: number;
	readonly resultSha: string;
	readonly rubric: string;
	readonly baselineContext: readonly ContextFile[];
	readonly evidence: BuildEvidence;
}

export interface PipelineConfirmationDependencies {
	readonly stageSession: StageSessionDependencies;
	readonly createProductOwner: typeof createProductOwner;
	readonly runStageJudge: (
		model: string,
		effort: Effort | undefined,
		budget: number,
		input: StageScorecard["input"],
		source: LoadedStageRubric,
	) => Promise<StageScorecard>;
	readonly runFinalJudge: (
		request: PipelineFinalJudgeRequest,
	) => Promise<JudgeResult>;
	readonly seedTaskBoard: typeof seedTaskBoard;
	readonly runChecks: typeof runChecks;
	readonly runSetup: (
		targetDir: string,
		setup: readonly TargetCheck[] | undefined,
		log: (message: string) => void,
	) => Promise<void>;
	readonly captureBaselineContext: typeof captureBaselineContext;
	readonly captureFileHashes: typeof captureFileHashes;
	readonly addWorktree: typeof addWorktree;
	readonly removeWorktree: typeof removeWorktree;
	readonly materializeCheckpoint: typeof materializeCheckpoint;
	readonly installStageCorpusSnapshot: typeof installStageCorpusSnapshot;
	readonly recordCheckpoint: typeof recordCheckpoint;
	readonly recordRetentionRef: typeof recordRetentionRef;
	readonly captureBuildCandidate: typeof captureBuildCandidate;
	readonly projectsDirectory?: string | undefined;
	readonly log: (message: string) => void;
}

export interface PipelineConfirmationRequest {
	readonly runsDirectory: string;
	readonly caseId: string;
	readonly groupId: string;
	readonly reps: number;
	readonly projectedCost: ConfirmationCostProjection;
	readonly approvalMethod: "interactive" | "yes";
	readonly source: SourceBaseline;
	readonly controlSha: string;
	readonly pipelinePath: string;
	readonly pipeline: PipelineDefinition;
	readonly task: string;
	readonly productBrief: string;
	readonly instructions: string;
	readonly finalRubric: string;
	readonly stageRubrics: Readonly<Record<string, LoadedStageRubric>>;
	readonly corpusRoots: readonly CorpusRoot[];
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly judgeModel: string;
	readonly judgeEffort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly loadedSettings?: LoadedStageSettings | undefined;
	readonly now?: (() => number) | undefined;
}

export interface PipelineConfirmationOutcome {
	readonly groupRecordFile: string;
	readonly reportFile: string;
	readonly repRecordFiles: readonly string[];
}

interface FrozenPipelineInputs {
	readonly taskId: string;
	readonly taskSha: string;
	readonly initialCheckpoint: CheckpointRecord;
	readonly checkpointDirectory: string;
	readonly baselineContext: readonly ContextFile[];
	readonly baselineHashes: ReadonlyMap<string, string>;
	readonly corpusDirectories: Readonly<Record<string, string>>;
	readonly corpusFiles: Readonly<Record<string, readonly HashedFile[]>>;
	readonly corpusVersion: CorpusMeasurement;
	readonly versionFiles: readonly HashedFile[];
	readonly files: readonly FrozenFile[];
}

async function freezePipelineInputs(
	dependencies: PipelineConfirmationDependencies,
	request: PipelineConfirmationRequest,
	groupDirectory: string,
	inputsDirectory: string,
	worktreesDirectory: string,
): Promise<FrozenPipelineInputs> {
	const corpusVersion = await dependencies.stageSession.measureCorpus();
	const versionFiles =
		await dependencies.stageSession.corpusVersionFiles(corpusVersion);
	const corpusRoot = join(inputsDirectory, "corpus");
	const corpusDirectories: Record<string, string> = {};
	const corpusFiles: Record<string, readonly HashedFile[]> = {};
	for (const stage of request.pipeline.stages) {
		const directory = join(corpusRoot, stage.name);
		corpusDirectories[stage.name] = directory;
		corpusFiles[stage.name] = await snapshotStageCorpus(
			stage.skill,
			request.instructions,
			request.corpusRoots,
			directory,
		);
	}

	const setupWorktree = join(worktreesDirectory, "setup");
	await dependencies.addWorktree(
		request.source.root,
		request.source.sha,
		setupWorktree,
	);
	let taskId: string;
	let taskSha: string;
	let baselineContext: readonly ContextFile[];
	let baselineHashes: ReadonlyMap<string, string>;
	const checkpointDirectory = join(inputsDirectory, "checkpoint");
	let initialCheckpoint: CheckpointRecord;
	try {
		await dependencies.runSetup(
			setupWorktree,
			request.pipeline.target.setup,
			dependencies.log,
		);
		await dependencies.runChecks(
			setupWorktree,
			"Baseline checks",
			request.pipeline.target.checks,
			dependencies.log,
		);
		baselineHashes = await dependencies.captureFileHashes(
			setupWorktree,
			request.pipeline.target.integrityFiles,
		);
		baselineContext = await dependencies.captureBaselineContext(setupWorktree);
		({ taskId, taskSha } = await dependencies.seedTaskBoard(
			setupWorktree,
			request.task,
			request.pipeline.statuses,
		));
		initialCheckpoint = await dependencies.recordCheckpoint(
			setupWorktree,
			checkpointDirectory,
			initialCheckpointInputs(
				{
					taskSha,
					task: request.task,
					productBrief: request.productBrief,
					workflowFiles: await hashWorkflowState(setupWorktree),
				},
				request.model,
				request.effort,
				request.loadedSettings?.hashed,
			),
		);
		await dependencies.recordRetentionRef(
			request.source.root,
			`${request.groupId}/setup`,
			taskSha,
		);
	} finally {
		await dependencies.removeWorktree(request.source.root, setupWorktree);
	}

	const files: FrozenFile[] = [
		...(await frozenDirectoryFiles(
			groupDirectory,
			checkpointDirectory,
			"checkpoint",
		)),
		...(await frozenDirectoryFiles(groupDirectory, corpusRoot, "corpus")),
		await writeFrozenFile(
			groupDirectory,
			join(inputsDirectory, "pipeline.json"),
			`${JSON.stringify(request.pipeline, null, 2)}\n`,
			"pipeline",
		),
		await writeFrozenFile(
			groupDirectory,
			join(inputsDirectory, "instructions.md"),
			request.instructions,
			"instructions",
		),
		await writeFrozenFile(
			groupDirectory,
			join(inputsDirectory, "task.md"),
			request.task,
			"task",
		),
		await writeFrozenFile(
			groupDirectory,
			join(inputsDirectory, "product-brief.md"),
			request.productBrief,
			"product-brief",
		),
		await writeFrozenFile(
			groupDirectory,
			join(inputsDirectory, "final-rubric.md"),
			request.finalRubric,
			"rubric",
		),
	];
	for (const stage of request.pipeline.stages) {
		const source = request.stageRubrics[stage.name];
		if (source === undefined) {
			throw new Error(`No frozen rubric for ${stage.name}`);
		}
		files.push(
			await writeFrozenFile(
				groupDirectory,
				join(inputsDirectory, `${stage.name}-rubric.json`),
				source.content,
				"rubric",
			),
		);
	}

	return {
		taskId,
		taskSha,
		initialCheckpoint,
		checkpointDirectory,
		baselineContext,
		baselineHashes,
		corpusDirectories,
		corpusFiles,
		corpusVersion,
		versionFiles,
		files,
	};
}

interface PipelineRepPlan {
	readonly repId: string;
	readonly ordinal: number;
	readonly worktreePath: string;
}

interface StageClock {
	readonly read: () => number | undefined;
	readonly start: () => void;
}

function createStageClock(now: () => number): StageClock {
	let startedAt: number | undefined;

	return {
		read: () => startedAt,
		start: () => {
			startedAt = now();
		},
	};
}

function measuredStageDependencies(
	dependencies: StageSessionDependencies,
	clock: StageClock,
): StageSessionDependencies {
	const detached = detachedStageDependencies(dependencies);

	return {
		...detached,
		runWorkflowStage: (request) => {
			clock.start();

			return detached.runWorkflowStage(request);
		},
	};
}

// The branches mirror the durable rep outcomes and retain their in-flight evidence.
// oxlint-disable-next-line eslint/complexity
async function runPipelineRep(
	dependencies: PipelineConfirmationDependencies,
	request: PipelineConfirmationRequest,
	frozen: FrozenPipelineInputs,
	paths: ReturnType<typeof confirmationGroupPaths>,
	plan: PipelineRepPlan,
	now: () => number,
): Promise<ConfirmationRepResult> {
	const repPaths = paths.rep(plan.repId);
	await mkdir(repPaths.stagesDirectory, { recursive: true });
	const repStart = now();
	const stageOutcomes: ConfirmationRepRecord["stages"] = [];
	const workerCalls: ProviderCall[] = [];
	const stageJudgeCalls: ProviderCall[] = [];
	const priorArtifacts: ContextFile[] = [];
	let upstream = frozen.initialCheckpoint.lineage;
	let baselineSha = frozen.taskSha;
	let buildEvidence: BuildEvidence | undefined;
	let resultSha = frozen.taskSha;
	let worktreeCreated = false;
	let productOwner: ProductOwner | undefined;
	let currentStageIndex = 0;
	let currentSession: StageSessionResult | undefined;
	let stageClock = createStageClock(now);
	let judgingStage = false;
	let judgingFinal = false;
	let setupOperation: string | undefined = "worktree creation";

	try {
		await dependencies.addWorktree(
			request.source.root,
			frozen.taskSha,
			plan.worktreePath,
		);
		worktreeCreated = true;
		setupOperation = "target setup";
		await dependencies.runSetup(
			plan.worktreePath,
			request.pipeline.target.setup,
			dependencies.log,
		);
		setupOperation = "checkpoint materialization";
		await dependencies.materializeCheckpoint(
			frozen.checkpointDirectory,
			plan.worktreePath,
		);
		setupOperation = undefined;
		productOwner = dependencies.createProductOwner({
			directory: join(repPaths.directory, "product-owner"),
			model: request.model,
			effort: request.effort,
			sessionBudgetUsd: request.sessionBudgetUsd,
			task: request.task,
			productBrief: request.productBrief,
		});

		for (const [index, definition] of request.pipeline.stages.entries()) {
			currentStageIndex = index;
			currentSession = undefined;
			stageClock = createStageClock(now);
			setupOperation = "corpus installation";
			await dependencies.installStageCorpusSnapshot(
				frozen.corpusDirectories[definition.name] ?? "",
				plan.worktreePath,
			);
			setupOperation = undefined;
			currentSession = await executeStageSession(
				{
					...measuredStageDependencies(dependencies.stageSession, stageClock),
					measureCorpus: () => Promise.resolve(frozen.corpusVersion),
					corpusVersionFiles: () => Promise.resolve(frozen.versionFiles),
				},
				{
					targetDir: plan.worktreePath,
					model: request.model,
					effort: request.effort,
					sessionBudgetUsd: request.sessionBudgetUsd,
					productOwner,
					task: request.task,
					productBrief: request.productBrief,
					instructions: request.instructions,
					baselineContext: frozen.baselineContext,
					baselineHashes: frozen.baselineHashes,
					target: request.pipeline.target,
					taskId: frozen.taskId,
					taskSha: frozen.taskSha,
					baselineSha,
					commitSubjectPattern: request.pipeline.commitSubjectPattern,
					corpusRoots: [
						{ kind: "directory", root: join(plan.worktreePath, ".claude") },
					],
					settingSources: "project",
					settingsOverlay: request.loadedSettings?.json,
				},
				definition,
				priorArtifacts,
			);
			workerCalls.push(...currentSession.transcript.providerCalls);
			const rubric = request.stageRubrics[definition.name];
			if (rubric === undefined) {
				throw new Error(`No frozen rubric for ${definition.name}`);
			}
			judgingStage = true;
			const scorecard = await dependencies.runStageJudge(
				request.judgeModel,
				request.judgeEffort,
				request.sessionBudgetUsd,
				currentSession.input,
				rubric,
			);
			judgingStage = false;
			stageJudgeCalls.push(...scorecard.attempts);
			const readManifest = await recordStageReads({
				targetDir: plan.worktreePath,
				startSha: baselineSha,
				transcript:
					dependencies.projectsDirectory === undefined
						? undefined
						: {
								sessionId: currentSession.transcript.sessionId,
								projectsDirectory: dependencies.projectsDirectory,
							},
				skill: definition.skill,
				corpusRoots: [join(plan.worktreePath, ".claude")],
				corpusFiles: frozen.corpusFiles[definition.name] ?? [],
				versionFiles: frozen.versionFiles,
				rubric: {
					path: definition.rubric,
					sha256: stageRubricSha256(scorecard.rubric),
				},
			});
			const stageFile = repPaths.stageFile(definition.name);
			await Bun.write(
				stageFile,
				`${JSON.stringify({ ...scorecard, readManifest }, null, 2)}\n`,
			);
			stageOutcomes.push({
				stage: definition.name,
				status: "JUDGED",
				grade: scorecard.grade.grade,
				verdict: scorecard.grade.verdict,
				elapsedMs: now() - (stageClock.read() ?? repStart),
				evidence: {
					resultSha: currentSession.resultSha,
					recordFile: relative(repPaths.directory, stageFile),
				},
			});
			({ resultSha } = currentSession);
			if (scorecard.grade.verdict === "STOP") {
				for (const later of request.pipeline.stages.slice(index + 1)) {
					stageOutcomes.push({
						stage: later.name,
						status: "NOT_REACHED",
						reason: `${definition.name} Judge stopped the rep`,
					});
				}
				const evidence = collectConfirmationMetrics({
					worker: workerCalls,
					productOwner: productOwner.snapshot().providerCalls,
					stageJudge: stageJudgeCalls,
					finalJudge: undefined,
				});
				const record = confirmationRepRecordSchema.parse({
					schemaVersion: 1,
					caseId: request.caseId,
					groupId: request.groupId,
					repId: plan.repId,
					ordinal: plan.ordinal,
					mode: "pipeline",
					worktreePath: plan.worktreePath,
					lineage: { kind: "SOURCE", sha: request.source.sha },
					outcome: "UNSUCCESSFUL",
					stages: stageOutcomes,
					finalOutcome: {
						status: "NOT_REACHED",
						reason: `${definition.name} Judge stopped the rep`,
					},
					metrics: evidence.metrics,
					workerTrajectorySteps: evidence.workerTrajectorySteps,
					elapsedMs: now() - repStart,
				});
				return await settleCompletedConfirmationRep({
					targetRoot: request.source.root,
					retentionName: `${request.groupId}/${plan.repId}`,
					resultSha: currentSession.resultSha,
					recordFile: repPaths.recordFile,
					recordContent: `${JSON.stringify(record, null, 2)}\n`,
					worktreePath: plan.worktreePath,
					recordRetentionRef: dependencies.recordRetentionRef,
					removeWorktree: dependencies.removeWorktree,
				});
			}
			({ resultSha: baselineSha } = currentSession);
			if (currentSession.artifact !== undefined) {
				priorArtifacts.push(currentSession.artifact);
			}
			if (currentSession.buildEvidence !== undefined) {
				({ buildEvidence } = currentSession);
			}
			const checkpoint = await dependencies.recordCheckpoint(
				plan.worktreePath,
				repPaths.checkpointDirectory(definition.name),
				{
					stage: definition.name,
					targetSha: currentSession.resultSha,
					upstream,
					model: request.model,
					effort: request.effort,
					corpusFiles: frozen.corpusFiles[definition.name] ?? [],
					corpusVersion: frozen.corpusVersion,
					artifacts: hashArtifacts(
						currentSession.artifact ? [currentSession.artifact] : [],
					),
					settingsFile: request.loadedSettings?.hashed,
					readManifest,
				},
			);
			upstream = checkpoint.lineage;
		}

		if (buildEvidence === undefined) {
			throw new Error("Build stage did not run");
		}
		const fullCandidate = await dependencies.captureBuildCandidate(
			plan.worktreePath,
			frozen.taskSha,
		);
		judgingFinal = true;
		const finalJudge = await dependencies.runFinalJudge({
			repId: plan.repId,
			ordinal: plan.ordinal,
			resultSha,
			rubric: request.finalRubric,
			baselineContext: frozen.baselineContext,
			evidence: {
				...buildEvidence,
				diff: fullCandidate.diff,
				changedPaths: fullCandidate.changedPaths,
			},
		});
		await Bun.write(
			repPaths.finalFile,
			`${JSON.stringify(finalJudge, null, 2)}\n`,
		);
		const evidence = collectConfirmationMetrics({
			worker: workerCalls,
			productOwner: productOwner.snapshot().providerCalls,
			stageJudge: stageJudgeCalls,
			finalJudge: finalJudge.attempts,
		});
		const successful =
			evidence.metrics.status === "COMPLETE" &&
			stageOutcomes.every(
				(stage) =>
					stage.status === "JUDGED" &&
					stage.verdict === "CONTINUE" &&
					(stage.grade === "A" || stage.grade === "B"),
			) &&
			finalJudge.grade.verdict === "PASS";
		const record = confirmationRepRecordSchema.parse({
			schemaVersion: 1,
			caseId: request.caseId,
			groupId: request.groupId,
			repId: plan.repId,
			ordinal: plan.ordinal,
			mode: "pipeline",
			worktreePath: plan.worktreePath,
			lineage: { kind: "SOURCE", sha: request.source.sha },
			outcome: successful ? "SUCCESSFUL" : "UNSUCCESSFUL",
			stages: stageOutcomes,
			finalOutcome: {
				status: "JUDGED",
				verdict: finalJudge.grade.verdict,
				evidence: {
					resultSha,
					recordFile: relative(repPaths.directory, repPaths.finalFile),
				},
			},
			metrics: evidence.metrics,
			workerTrajectorySteps: evidence.workerTrajectorySteps,
			elapsedMs: now() - repStart,
		});
		return await settleCompletedConfirmationRep({
			targetRoot: request.source.root,
			retentionName: `${request.groupId}/${plan.repId}`,
			resultSha,
			recordFile: repPaths.recordFile,
			recordContent: `${JSON.stringify(record, null, 2)}\n`,
			worktreePath: plan.worktreePath,
			recordRetentionRef: dependencies.recordRetentionRef,
			removeWorktree: dependencies.removeWorktree,
		});
	} catch (error) {
		const failure = error instanceof Error ? error : new Error(String(error));
		const diagnosticError =
			setupOperation === undefined
				? failure.message
				: `${setupOperation} failed: ${failure.message}`;
		const judgeFailure =
			failure instanceof JudgeOutputValidationError ? failure : undefined;
		const judgeExecutionFailure =
			failure instanceof JudgeExecutionError ? failure : undefined;
		const completedJudgeRejection =
			judgeFailure !== undefined &&
			worktreeCreated &&
			productOwner !== undefined &&
			(judgingFinal || currentSession !== undefined);
		if (failure instanceof WorkflowExecutionError) {
			workerCalls.push(...failure.providerCalls);
		} else if (
			stageClock.read() !== undefined &&
			currentSession === undefined
		) {
			workerCalls.push({});
		}
		if (judgingStage && judgeExecutionFailure !== undefined) {
			stageJudgeCalls.push(...judgeExecutionFailure.providerCalls);
		} else if (judgingStage && judgeFailure === undefined) {
			stageJudgeCalls.push({});
		}
		let stages = [...stageOutcomes];
		let finalOutcome: ConfirmationRepRecord["finalOutcome"];
		if (judgingFinal) {
			if (judgeFailure !== undefined) {
				await Bun.write(
					repPaths.finalFile,
					`${JSON.stringify(
						{
							status: "REJECTED",
							prompt: judgeFailure.prompt,
							attempts: judgeFailure.attempts,
							costUsd: judgeFailure.costUsd,
							error: failure.message,
						},
						null,
						2,
					)}\n`,
				);
			}
			finalOutcome = {
				status: "EXECUTION_FAILED",
				error: failure.message,
				...(completedJudgeRejection
					? {
							evidence: {
								resultSha,
								recordFile: relative(repPaths.directory, repPaths.finalFile),
							},
						}
					: { worktreePath: plan.worktreePath }),
			};
		} else {
			const failedStage = request.pipeline.stages[currentStageIndex];
			if (failedStage === undefined) {
				throw new Error("Pipeline must declare at least one stage", {
					cause: error,
				});
			}
			let evidence:
				| { readonly resultSha: string; readonly recordFile: string }
				| undefined;
			if (completedJudgeRejection && judgeFailure !== undefined) {
				stageJudgeCalls.push(...judgeFailure.attempts);
				const stageFile = repPaths.stageFile(failedStage.name);
				await Bun.write(
					stageFile,
					`${JSON.stringify(
						{
							stage: failedStage.name,
							status: "REJECTED",
							prompt: judgeFailure.prompt,
							attempts: judgeFailure.attempts,
							costUsd: judgeFailure.costUsd,
							error: failure.message,
						},
						null,
						2,
					)}\n`,
				);
				evidence = {
					resultSha: currentSession?.resultSha ?? resultSha,
					recordFile: relative(repPaths.directory, stageFile),
				};
			}
			stages = [
				...stageOutcomes,
				{
					stage: failedStage.name,
					status: "EXECUTION_FAILED",
					error: diagnosticError,
					elapsedMs: now() - (stageClock.read() ?? repStart),
					...(evidence === undefined
						? { worktreePath: plan.worktreePath }
						: { evidence }),
				},
				...request.pipeline.stages
					.slice(currentStageIndex + 1)
					.map((stage) => ({
						stage: stage.name,
						status: "NOT_REACHED" as const,
						reason: `${failedStage.name} execution failed`,
					})),
			];
			finalOutcome = {
				status: "NOT_REACHED",
				reason: `${failedStage.name} execution failed`,
			};
		}

		const evidence = collectConfirmationMetrics({
			worker: workerCalls,
			productOwner: productOwner?.snapshot().providerCalls,
			stageJudge: stageJudgeCalls,
			finalJudge: judgingFinal
				? (judgeExecutionFailure?.providerCalls ?? judgeFailure?.attempts ?? [])
				: undefined,
		});
		const record = confirmationRepRecordSchema.parse({
			schemaVersion: 1,
			caseId: request.caseId,
			groupId: request.groupId,
			repId: plan.repId,
			ordinal: plan.ordinal,
			mode: "pipeline",
			worktreePath: plan.worktreePath,
			lineage: { kind: "SOURCE", sha: request.source.sha },
			outcome: "UNSUCCESSFUL",
			stages,
			finalOutcome,
			metrics: evidence.metrics,
			workerTrajectorySteps: evidence.workerTrajectorySteps,
			elapsedMs: now() - repStart,
		});
		if (completedJudgeRejection) {
			const retainedSha = currentSession?.resultSha ?? resultSha;

			return settleCompletedConfirmationRep({
				targetRoot: request.source.root,
				retentionName: `${request.groupId}/${plan.repId}`,
				resultSha: retainedSha,
				recordFile: repPaths.recordFile,
				recordContent: `${JSON.stringify(record, null, 2)}\n`,
				worktreePath: plan.worktreePath,
				recordRetentionRef: dependencies.recordRetentionRef,
				removeWorktree: dependencies.removeWorktree,
			});
		}

		return settleDiagnosticConfirmationRep({
			recordFile: repPaths.recordFile,
			recordContent: `${JSON.stringify(record, null, 2)}\n`,
			worktreeCreated,
			preservedMessage: `Pipeline rep ${plan.repId} failed; evidence preserved at ${plan.worktreePath}`,
			log: dependencies.log,
		});
	}
}

export async function runPipelineConfirmation(
	dependencies: PipelineConfirmationDependencies,
	request: PipelineConfirmationRequest,
): Promise<PipelineConfirmationOutcome> {
	const now = request.now ?? (() => performance.now());
	const paths = confirmationGroupPaths(request.runsDirectory, request.groupId);
	await mkdir(paths.inputsDirectory, { recursive: true });
	// The provider names a session's transcript after its real working path.
	const worktreesDirectory = await realpath(
		await mkdtemp(join(tmpdir(), `rehearse-${request.groupId}-`)),
	);
	try {
		const frozen = await freezePipelineInputs(
			dependencies,
			request,
			paths.directory,
			paths.inputsDirectory,
			worktreesDirectory,
		);
		await claimShortId(request.runsDirectory, request.caseId, {
			kind: "group",
			groupId: request.groupId,
		});
		const makespanStart = now();
		const results = await runConfirmation(
			{
				groupId: request.groupId,
				reps: request.reps,
				frozenInputs: frozen,
				worktreePath: (repId) => join(worktreesDirectory, repId),
			},
			(plan) => runPipelineRep(dependencies, request, frozen, paths, plan, now),
		);
		const makespanMs = now() - makespanStart;
		const repResults = results.map(({ outcome }) => {
			if (outcome.status === "rejected") {
				throw outcome.reason;
			}

			return outcome.value;
		});

		return await finalizeConfirmationGroup({
			mode: "pipeline",
			caseId: request.caseId,
			groupId: request.groupId,
			reps: request.reps,
			declaredStages: request.pipeline.stages.map(({ name }) => name),
			inputs: {
				lineage: { kind: "SOURCE", sha: request.source.sha },
				files: frozen.files,
				model: request.model,
				effort: request.effort,
				judgeModel: request.judgeModel,
				judgeEffort: request.judgeEffort,
				sessionBudgetUsd: request.sessionBudgetUsd,
				pipelinePath: request.pipelinePath,
				corpusVersion: frozen.corpusVersion,
			},
			projectedCost: request.projectedCost,
			approvalMethod: request.approvalMethod,
			repResults,
			worktreesDirectory,
			groupDirectory: paths.directory,
			runsDirectory: request.runsDirectory,
			groupFile: paths.groupFile,
			reportFile: paths.reportFile,
			makespanMs,
		});
	} catch (error) {
		await rm(worktreesDirectory, { force: true, recursive: true });
		throw error;
	}
}
