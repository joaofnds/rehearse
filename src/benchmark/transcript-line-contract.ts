import type { z } from "zod";

import type { Immutable } from "./contracts";
import type {
	TranscriptLocation,
	diagnosticIssueKindSchema,
	repeatedBashCommandSchema,
} from "./transcript-diagnostics-contract";
import type { ToolUse } from "./transcript-message-contract";

/**
 * What a user row is, beyond a tool result or a meta row the harness wrote: a
 * compaction summary, an interruption marker, a background agent's
 * notification, or a prompt.
 */
type UserTurn =
	| "compaction summary"
	| "interruption"
	| "prompt"
	| "task notification";

interface LocatedToolUse {
	readonly use: ToolUse;
	readonly toolUseId: string | undefined;
	readonly location: TranscriptLocation;
}

interface LocatedToolResult {
	readonly toolUseId: string | undefined;
	readonly isError: boolean;
	readonly location: TranscriptLocation;
}

interface LocatedToolIdentity {
	readonly toolUseId: string | undefined;
	readonly location: TranscriptLocation;
}

interface LocatedDiagnosticIssue {
	readonly kind: z.infer<typeof diagnosticIssueKindSchema>;
	readonly location: TranscriptLocation;
}

interface IdentifiedToolUse {
	readonly toolUseId: string;
	readonly location: TranscriptLocation;
}

interface DiagnosticGrouping<Entry extends Immutable<LocatedToolIdentity>> {
	readonly byId: ReadonlyMap<string, readonly Entry[]>;
	readonly issues: readonly LocatedDiagnosticIssue[];
}

type LocatedToolUseMap = ReadonlyMap<
	string,
	Immutable<readonly LocatedToolUse[]>
>;

type LocatedToolResultMap = ReadonlyMap<
	string,
	Immutable<readonly LocatedToolResult[]>
>;

interface RepeatedBashDiagnostics {
	readonly commands: z.infer<typeof repeatedBashCommandSchema>[];
	readonly issues: readonly LocatedDiagnosticIssue[];
}

interface TranscriptLine {
	readonly line: number;
	readonly toolUses: readonly ToolUse[];
	readonly outputStyle: string | undefined;
	readonly instructionFiles: readonly string[];
	readonly skillDirectories: readonly string[];
	readonly locatedToolUses: readonly LocatedToolUse[];
	readonly locatedToolResults: readonly LocatedToolResult[];
	readonly diagnosticIssues: readonly LocatedDiagnosticIssue[];
	readonly namedAgent: string | undefined;
	readonly userTurn: UserTurn | undefined;
	/** A user row that names no parent row, as a conversation's first does. */
	readonly startsWithoutParent: boolean;
	/** The provider's id for the request an assistant row belongs to. */
	readonly requestId: string | undefined;
	/** The tool call whose output a meta row carries, such as a skill's body. */
	readonly sourceToolUseId: string | undefined;
}

export type {
	UserTurn,
	TranscriptLine,
	LocatedToolUse,
	LocatedToolResult,
	LocatedDiagnosticIssue,
	LocatedToolIdentity,
	DiagnosticGrouping,
	LocatedToolUseMap,
	LocatedToolResultMap,
	RepeatedBashDiagnostics,
	IdentifiedToolUse,
};
