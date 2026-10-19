import type { ReplayCliConfig } from "#benchmark/config";
import type { ReplayRequest } from "#benchmark/replay";
import type { ReplayStageOutcome } from "#benchmark/replay-command";
import type {
	ReplayConfirmationOutcome,
	ReplayConfirmationRequest,
} from "#benchmark/replay-confirmation";
import type { BenchmarkRunPaths } from "#benchmark/run-layout";
import type { CommandOutput } from "#cli/output";

interface ReplayEvidence {
	readonly recordPath: string;
	readonly lineage: string;
}

type ReplayCommandOutcome = ReplayStageOutcome<
	ReplayEvidence,
	ReplayConfirmationOutcome
>;

interface ReplayCommandRequest {
	readonly args: readonly string[];
	readonly json: boolean;
	readonly stdinIsTerminal: boolean;
}

interface ReplayExecution {
	readonly config: ReplayCliConfig;
	readonly paths: BenchmarkRunPaths;
}

interface ReplayAuthorization {
	readonly output: CommandOutput;
	readonly spendCeilingUsd: number;
}

interface ReplayCommandDependencies {
	readonly output: CommandOutput;
	readonly resolveRunDirectory: (runName: string) => Promise<string>;
	readonly probeModel: (model: string) => Promise<void>;
	readonly requireSpendCeiling: (recordsDirectory: string) => Promise<number>;
	readonly execute: (
		replay: ReplayExecution,
		authorization: ReplayAuthorization,
	) => Promise<ReplayCommandOutcome>;
}

interface ReplayOutcomeContext {
	readonly request: ReplayCommandRequest;
	readonly config: ReplayCliConfig;
	readonly paths: BenchmarkRunPaths;
}

interface ReplayAttempts {
	readonly runDebug: (request: ReplayRequest) => Promise<ReplayEvidence>;
	readonly runConfirmed: (
		request: ReplayConfirmationRequest,
	) => Promise<ReplayConfirmationOutcome>;
}

export type {
	ReplayAttempts,
	ReplayAuthorization,
	ReplayCommandDependencies,
	ReplayCommandOutcome,
	ReplayCommandRequest,
	ReplayEvidence,
	ReplayExecution,
	ReplayOutcomeContext,
};
