import type { CorpusRoot } from "./corpus-file";
import type { StageDefinition } from "./pipeline";
import type { StageContext } from "./run-stage-context";
import type { StageDependencies } from "./run-stage-contract";
import type { StageRunHistory } from "./run-stage-history";
import type {
	StageSessionEnvironment,
	StageSessionResult,
} from "./stage-session-contract";

interface StageIterationRequest {
	readonly dependencies: StageDependencies;
	readonly context: StageContext;
	readonly history: StageRunHistory;
	readonly definition: StageDefinition;
	readonly corpusRoots: readonly CorpusRoot[];
}

interface StageRunObservation extends Pick<
	StageSessionResult,
	"corpusFiles" | "corpusVersion" | "versionFiles" | "input"
> {
	readonly definition: StageDefinition;
	readonly session: StageSessionResult;
	readonly sessionContext: StageSessionEnvironment;
	readonly stage: string;
	readonly stageStartedAtMs: number | undefined;
}

export type { StageIterationRequest, StageRunObservation };
