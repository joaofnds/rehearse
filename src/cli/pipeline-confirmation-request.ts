import { randomUUID } from "node:crypto";

import type { BenchmarkCase } from "#benchmark/case";
import { corpusLayoutRoots } from "#benchmark/checkpoint";
import type { ApprovalMethod, BenchmarkConfig } from "#benchmark/config";
import { recordsDirectory } from "#benchmark/config";
import type { Immutable } from "#benchmark/contracts";
import type { LiveCorpusRoot } from "#benchmark/corpus-file";
import type { PipelineConfirmationRequest } from "#benchmark/pipeline-confirmation";
import type { LoadedStageSettings } from "#benchmark/stage-settings";
import type { SourceBaseline } from "#benchmark/target";

interface ConfirmationApproval {
	readonly reps: number;
	readonly projectedCost: PipelineConfirmationRequest["projectedCost"];
	readonly approvalMethod: ApprovalMethod;
}

interface ConfirmationRequestInputs {
	readonly corpusSource: LiveCorpusRoot;
	readonly benchmarkCase: BenchmarkCase;
	readonly config: BenchmarkConfig;
	readonly confirmation: ConfirmationApproval;
	readonly controlSha: string;
	readonly source: SourceBaseline;
	readonly instructions: string;
	readonly loadedSettings: LoadedStageSettings;
	readonly spendCeilingUsd: number;
}

/**
 * The loaded case is the one owner of the case identity, so the group and rep
 * records name what the run actually loaded rather than a second copy of the
 * id that the configuration carries for the manifest.
 */
function buildConfirmationRequest(
	inputs: Immutable<ConfirmationRequestInputs>,
): PipelineConfirmationRequest {
	const { benchmarkCase, config, confirmation } = inputs;

	return {
		approvalMethod: confirmation.approvalMethod,
		caseId: benchmarkCase.declaration.id,
		controlSha: inputs.controlSha,
		corpusRoots: corpusLayoutRoots(inputs.source.root, inputs.corpusSource),
		effort: config.effort,
		finalRubric: benchmarkCase.finalRubric,
		groupId: randomUUID(),
		instructions: inputs.instructions,
		judgeEffort: config.judgeEffort,
		judgeModel: config.judgeModel,
		loadedSettings: inputs.loadedSettings,
		model: config.model,
		pipeline: benchmarkCase.pipeline,
		pipelinePath: config.pipelinePath,
		productBrief: benchmarkCase.productBrief,
		projectedCost: confirmation.projectedCost,
		reps: confirmation.reps,
		runsDirectory: recordsDirectory(),
		sessionBudgetUsd: config.sessionBudgetUsd,
		source: inputs.source,
		spendCeilingUsd: inputs.spendCeilingUsd,
		stageRubrics: benchmarkCase.stageRubrics,
		task: benchmarkCase.task,
	};
}

export { buildConfirmationRequest as default };
export type { ConfirmationApproval, ConfirmationRequestInputs };
