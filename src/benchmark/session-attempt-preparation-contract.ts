import type { SessionCase } from "./case";
import type { HashedFile } from "./checkpoint";
import type { SessionSettings } from "./claude";
import type {
	ContextEvidence,
	ContextEvidenceSource,
	ContextRateCatalog,
} from "./context-evidence";
import type { CorpusDelivery } from "./corpus-delivery";
import type { HomePathCitationMap } from "./home-path-citation";
import type { JudgeInvoker } from "./judge-attempt";
import type { SessionCorpusSnapshot } from "./session-corpus";
import type { PreparedSetup } from "./session-setup";
import type { SpendCeiling } from "./spend-ceiling";

type ClaudeRunner = (
	command: readonly string[],
	cwd: string,
) => Promise<string>;

/** What an attempt needs from the command's record of its attempts under way. */
interface AttemptsInFlight {
	readonly track: <Result>(start: () => Promise<Result>) => Promise<Result>;
	readonly assertOpen: () => void;
	/** Where an operator stop is to be recorded for an attempt record just claimed. */
	readonly claimRecord: (operatorStopFile: string) => Promise<void>;
	/** Once the attempt settles, a later stop no longer records itself there. */
	readonly releaseRecord: (operatorStopFile: string) => void;
	/** The signal of the operator stop that closed it, if one has. */
	readonly stoppedBy: () => NodeJS.Signals | undefined;
}

interface SessionAttemptRequest {
	readonly sessionCase: SessionCase;
	readonly spendCeiling?: SpendCeiling | undefined;
	readonly invokeJudge?: JudgeInvoker | undefined;
	readonly settings: SessionSettings;
	readonly projectsDirectory: string;
	/** The home directory whose Claude Code setup a session runs with. */
	readonly home: string;
	/**
	 * Rehearse's own environment, which the session starts from and whose
	 * Claude Code configuration the attempt records.
	 */
	readonly environment: Readonly<Record<string, string | undefined>>;
	readonly recordDirectory: string;
	readonly runClaude: ClaudeRunner;
	/** The command's attempts under way, which an operator stop closes and awaits. */
	readonly inFlight: AttemptsInFlight;
	readonly corpusSnapshot?: SessionCorpusSnapshot | undefined;
	/**
	 * Where the live install's corpus files are cited from, read once for the
	 * run so every attempt of it delivers against the same map.
	 */
	readonly liveCitations: HomePathCitationMap;
	readonly contextEvidenceSource?: ContextEvidenceSource | undefined;
	readonly contextRateCatalog?: ContextRateCatalog | undefined;
}

interface SessionNaming {
	readonly sessionId: string;
	readonly resumed: boolean;
}

class SessionInputError extends Error {
	public override name = "SessionInputError";
}

interface CorpusOverlay {
	readonly styleName: string | undefined;
	readonly installed: readonly string[];
	readonly held: readonly string[];
	readonly delivery: CorpusDelivery;
	/** Where the held files' live copies are, to find reads that reached them. */
	readonly citations: HomePathCitationMap;
}

interface AttemptPreparation {
	readonly sessionCase: SessionCase;
	readonly settings: SessionSettings;
	readonly attemptDirectory: string;
	readonly setupDirectory: string;
}

interface PreparedAttempt extends AttemptPreparation {
	readonly request: SessionAttemptRequest;
	readonly startingProjectFiles: readonly HashedFile[];
	readonly overlay: CorpusOverlay;
	readonly slug: string;
	readonly session: SessionNaming;
	readonly transcriptPath: string;
	readonly contextEvidence: ContextEvidence | undefined;
	readonly setup: PreparedSetup;
}

export { SessionInputError as default };
export type {
	AttemptsInFlight,
	ClaudeRunner,
	SessionAttemptRequest,
	SessionNaming,
	AttemptPreparation,
	PreparedAttempt,
	CorpusOverlay,
};
