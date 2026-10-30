import type { HashedFile } from "./checkpoint";
import type { Effort } from "./config";
import type {
	ContextFile,
	StageJudgeInput,
	StageTranscript,
} from "./contracts";
import type { CorpusRoot } from "./corpus-file";
import type { CorpusMeasurement } from "./corpus-measurement";
import type { StageDefinition, TargetDefinition } from "./pipeline";
import type { BuildEvidence } from "./run-artifact";
import type { RunEventRecorder } from "./run-events";
import type { SpendCeiling } from "./spend-ceiling";
import type { ProductOwner } from "./workflow";

interface StageSessionEnvironment {
	readonly targetDir: string;
	readonly sessionId: string;
	readonly model: string;
	readonly effort?: Effort | undefined;
	readonly sessionBudgetUsd: number;
	readonly spendCeiling: SpendCeiling;
	readonly productOwner: ProductOwner;
	readonly task: string;
	readonly productBrief: string;
	readonly instructions: string;
	readonly baselineContext: readonly ContextFile[];
	readonly baselineHashes: ReadonlyMap<string, string>;
	readonly target: TargetDefinition;
	readonly taskId: string;
	readonly taskSha: string;
	readonly baselineSha: string;
	readonly commitSubjectPattern?: string | undefined;
	readonly corpusRoots: readonly CorpusRoot[];
	readonly setup?: "actual" | undefined;
	readonly settingsOverlay?: string | undefined;
	readonly runEvents?: RunEventRecorder | undefined;
	readonly elapsedMs?: (() => number) | undefined;
}

interface StageSessionResult {
	readonly resultSha: string;
	readonly corpusFiles: readonly HashedFile[];
	readonly corpusVersion: CorpusMeasurement;
	/** The files `corpusVersion` holds, read before the session spends. */
	readonly versionFiles: readonly HashedFile[];
	readonly transcript: StageTranscript;
	readonly input: StageJudgeInput;
	readonly artifact?: ContextFile | undefined;
	readonly buildEvidence?: BuildEvidence | undefined;
}

interface StageExecutionInputs {
	readonly definition: StageDefinition;
	readonly priorArtifacts: readonly ContextFile[];
}

export type {
	StageSessionEnvironment,
	StageSessionResult,
	StageExecutionInputs,
};
