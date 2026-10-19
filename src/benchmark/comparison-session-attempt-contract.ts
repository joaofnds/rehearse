import type { SessionCaseDeclaration } from "./case";
import type { FrozenFile } from "./comparison-evidence";
import type {
	ParsedConfirmationGroupRecord,
	ParsedConfirmationRepRecord,
	SESSION_CONFIRMATION_SCHEMA_VERSION,
} from "./confirmation-record";
import type { Immutable } from "./contracts";
import type { SessionAttemptRecord } from "./session-record";

type SessionGroupRecord = Extract<
	ParsedConfirmationGroupRecord,
	{
		schemaVersion: typeof SESSION_CONFIRMATION_SCHEMA_VERSION;
		mode: "session";
	}
>;

type SessionRepRecord = Extract<
	ParsedConfirmationRepRecord,
	{
		schemaVersion: typeof SESSION_CONFIRMATION_SCHEMA_VERSION;
		mode: "session";
	}
>;

interface SessionAttemptEvidence {
	readonly group: Immutable<SessionGroupRecord>;
	readonly rep: Immutable<SessionRepRecord>;
	readonly attempt: Immutable<SessionAttemptRecord>;
}

interface SessionAttemptDefinition {
	readonly sessionCase: Immutable<SessionCaseDeclaration>;
	readonly frozenCorpus: readonly FrozenFile[];
	readonly field: string;
}

interface SessionAttemptPair {
	readonly attempt: Immutable<SessionAttemptRecord>;
	readonly rep: Immutable<SessionRepRecord>;
}

interface SessionCheckDefinition {
	readonly sessionCase: Immutable<SessionCaseDeclaration>;
	readonly field: string;
}

export type {
	SessionAttemptDefinition,
	SessionAttemptEvidence,
	SessionAttemptPair,
	SessionCheckDefinition,
	SessionGroupRecord,
	SessionRepRecord,
};
