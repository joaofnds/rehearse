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
import type { SessionCorpusSnapshot } from "./session-corpus";
import type { PreparedSetup } from "./session-setup";

type ClaudeRunner = (
	command: readonly string[],
	cwd: string,
) => Promise<string>;

interface SessionAttemptRequest {
	readonly sessionCase: SessionCase;
	readonly settings: SessionSettings;
	readonly projectsDirectory: string;
	/** The home directory whose Claude Code setup a session runs with. */
	readonly home: string;
	/** The environment the session inherits, which can name plugin directories. */
	readonly environment: Readonly<Record<string, string | undefined>>;
	readonly recordDirectory: string;
	readonly runClaude: ClaudeRunner;
	readonly corpusSnapshot?: SessionCorpusSnapshot | undefined;
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
	ClaudeRunner,
	SessionAttemptRequest,
	SessionNaming,
	AttemptPreparation,
	PreparedAttempt,
	CorpusOverlay,
};
