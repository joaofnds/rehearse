import type { SessionCase } from "./case";
import type { ComparisonArm } from "./comparison-record";
import type { Immutable } from "./contracts";
import type { StateCheck } from "./session-state-check";

type AttemptVariant =
	| "pass"
	| "fail"
	| "no-reply"
	| "execution-failed"
	| "missing-metrics";

type AttemptVariantSelector = (
	caseId: string,
	role: ComparisonArm,
	ordinal: number,
) => AttemptVariant | undefined;

interface ComparisonDirectories {
	readonly root: string;
	readonly runsDirectory: string;
}

interface ComparisonGroupIdentity {
	readonly caseId: string;
	readonly role: ComparisonArm;
}

interface ManifestCases {
	readonly selectVariant?: AttemptVariantSelector | undefined;
	readonly caseIds?: readonly string[] | undefined;
	readonly stateCheck?: Immutable<StateCheck> | undefined;
}

interface SessionSourceDirectories {
	readonly manifestDirectory: string;
	readonly runsDirectory: string;
}

type SharedSessionCaseField =
	| "tools"
	| "settings"
	| "agents"
	| "projectFiles"
	| "checks"
	| "stateCheck";

interface StateGroupCase {
	readonly benchmarkCase: SessionCase;
	readonly declaredBudgetUsd: number;
}

const MULTIPLE_GROUP_COMPARISON_REPORT_VERSION = 6;

const FIRST_REP_ORDINAL = 1;

const SECOND_REP_ORDINAL = 2;

const SESSION_CONFIRMATION_RECORD_VERSION = 2;

const JSON_INDENTATION_SPACES = 2;

const PROBE_SKILL = "skills/probe/SKILL.md";

const PROBE_NOTES = "skills/probe/references/notes.md";

export {
	MULTIPLE_GROUP_COMPARISON_REPORT_VERSION,
	FIRST_REP_ORDINAL,
	SECOND_REP_ORDINAL,
	SESSION_CONFIRMATION_RECORD_VERSION,
	JSON_INDENTATION_SPACES,
	PROBE_SKILL,
	PROBE_NOTES,
};

export type {
	AttemptVariant,
	AttemptVariantSelector,
	ComparisonDirectories,
	ComparisonGroupIdentity,
	ManifestCases,
	SessionSourceDirectories,
	SharedSessionCaseField,
	StateGroupCase,
};
