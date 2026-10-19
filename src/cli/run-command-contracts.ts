import type { BenchmarkCase, LoadedCase, SessionCase } from "#benchmark/case";
import type { BenchmarkConfig, SessionRunConfig } from "#benchmark/config";
import type {
	ModelPreflightEvidence,
	assertSystemPromptSnapshotSupported,
} from "#benchmark/model-preflight";
import type { PipelinePreflightInputs } from "#benchmark/preflight";
import type { SessionConfirmationDependencies } from "#benchmark/session-confirmation";
import type { LoadedStageSettings } from "#benchmark/stage-settings";
import type { CommandOutput } from "#cli/output";
import type runSessionDebugAttempt from "#cli/session-debug-attempt";

interface RunCommandRequest {
	readonly args: readonly string[];
	readonly json: boolean;
	readonly stdinIsTerminal: boolean;
}

type RunOutcome =
	| { readonly kind: "debug"; readonly recordFile: string }
	| { readonly kind: "confirmation"; readonly recordFile: string };

interface PipelineRunExecution {
	readonly config: BenchmarkConfig;
	readonly output: CommandOutput;
	readonly benchmarkCase: BenchmarkCase;
	readonly loadedSettings: LoadedStageSettings;
	readonly spendCeilingUsd: number;
}

interface SessionRunExecution {
	readonly config: SessionRunConfig;
	readonly output: CommandOutput;
	readonly sessionCase: SessionCase;
}

interface RunCommandDependencies {
	readonly environment?: Readonly<Record<string, string | undefined>>;
	readonly output: CommandOutput;
	readonly requireCase: (caseId: string) => Promise<LoadedCase>;
	readonly assertPreflight: (
		inputs: PipelinePreflightInputs,
	) => Promise<LoadedStageSettings>;
	readonly probeModel: (model: string) => Promise<ModelPreflightEvidence>;
	readonly requireSpendCeiling: (recordsDirectory: string) => Promise<number>;
	readonly execute: (request: PipelineRunExecution) => Promise<RunOutcome>;
	readonly executeSession: (
		request: SessionRunExecution,
		boundary: SessionExecutionBoundary,
	) => Promise<RunOutcome>;
}

interface SessionExecutionBoundary {
	readonly probeModel: RunCommandDependencies["probeModel"];
	/** The stored ceiling each attempt's record carries. */
	readonly spendCeilingUsd: number;
}

interface SessionRunExecutionDependencies extends SessionExecutionBoundary {
	readonly assertSystemPromptSnapshotSupported?: typeof assertSystemPromptSnapshotSupported;
	readonly runDebug?: typeof runSessionDebugAttempt;
	readonly executeAttempt?: SessionConfirmationDependencies["executeAttempt"];
	readonly resolveCorpus?: SessionConfirmationDependencies["resolveCorpus"];
	readonly runsDirectory?: string;
	readonly stopOnSignal?: (
		cleanUp: () => Promise<void>,
		recordStop: (signal: NodeJS.Signals) => Promise<void>,
	) => () => void;
}

export type {
	PipelineRunExecution,
	RunCommandDependencies,
	RunCommandRequest,
	RunOutcome,
	SessionExecutionBoundary,
	SessionRunExecution,
	SessionRunExecutionDependencies,
};
