import type { SessionCase } from "./case";
import type { SessionSettings } from "./claude";
import type { ApprovalMethod } from "./config";
import type { ConfirmationCostProjection } from "./confirmation";
import type { Immutable } from "./contracts";
import type { ResolvedCorpusFile } from "./corpus-file";
import type { CorpusSourceResolver } from "./corpus-source";
import type { ModelPreflightEvidence } from "./model-preflight";
import type { SessionAttempt } from "./session-attempt";
import type { SessionCorpusSnapshot } from "./session-corpus";

interface SessionConfirmationRequest {
	readonly runsDirectory: string;
	readonly groupId: string;
	readonly reps: number;
	readonly projectedCost: ConfirmationCostProjection & {
		readonly preflightMaximumUsd: number;
	};
	readonly approvalMethod: ApprovalMethod;
	readonly sessionCase: SessionCase;
	readonly corpus?: string | undefined;
	readonly model: string;
	readonly effort?: SessionSettings["effort"] | undefined;
	readonly sessionBudgetUsd: number;
	readonly spendCeilingUsd: number;
	readonly preflight: ModelPreflightEvidence;
}

interface SessionConfirmationRepPlan {
	readonly spendCeilingUsd?: number | undefined;
	readonly ordinal: number;
	readonly repId: string;
	readonly recordDirectory: string;
	readonly sessionCase: SessionCase;
	readonly settings: SessionSettings;
	readonly corpusSnapshot: SessionCorpusSnapshot;
	readonly corpusFiles: readonly ResolvedCorpusFile[];
	readonly lineage: string;
}

interface SessionConfirmationDependencies {
	readonly executeAttempt: (
		plan: Immutable<SessionConfirmationRepPlan>,
	) => Promise<SessionAttempt>;
	readonly now?: (() => number) | undefined;
	/** Epoch milliseconds a start time is read from; Date.now unless a test pins it. */
	readonly wallClock?: (() => number) | undefined;
	readonly resolveCorpus?: CorpusSourceResolver | undefined;
}

export type {
	SessionConfirmationRequest,
	SessionConfirmationRepPlan,
	SessionConfirmationDependencies,
};
