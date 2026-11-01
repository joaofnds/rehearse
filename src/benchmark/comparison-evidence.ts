import type { SessionCaseDeclaration } from "./case";
import type { FinalJudgeIdentity } from "./comparison-final-judge";
import type { ComparisonArm } from "./comparison-record";
import type { StageGradingRecord } from "./comparison-stage-grading";
import type {
	ConfirmationMode,
	ParsedConfirmationGroupRecord,
	ParsedConfirmationRepRecord,
} from "./confirmation-record";
import type { Immutable } from "./contracts";
import { RefusedPreconditionError } from "./exit-codes";
import type { SessionAttemptRecord } from "./session-record";

type FrozenFile = ParsedConfirmationGroupRecord["inputs"]["files"][number];

interface DigestedRecord<Record> {
	readonly path: string;
	readonly sha256: string;
	readonly record: Record;
	readonly canonicalPath?: string;
}

interface LoadedFrozenFile {
	readonly record: FrozenFile;
	readonly text: string;
}

interface LoadedComparisonArmEvidence {
	readonly role: ComparisonArm;
	readonly declaredCaseId: string | undefined;
	readonly group: DigestedRecord<Immutable<ParsedConfirmationGroupRecord>>;
	readonly reps: readonly DigestedComparisonRep[];
	readonly frozenFiles: readonly LoadedFrozenFile[];
	readonly sessionCase?: Immutable<SessionCaseDeclaration>;
	readonly sourcePaths: readonly string[];
}

interface DigestedComparisonRep {
	readonly path: string;
	readonly sha256: string;
	readonly record: Immutable<ParsedConfirmationRepRecord>;
	readonly canonicalPath?: string;
	readonly attempt?: DigestedRecord<Immutable<SessionAttemptRecord>>;
	readonly scorecards?: readonly DigestedRecord<StageGradingRecord>[];
	readonly finalJudge?: DigestedRecord<FinalJudgeIdentity> | undefined;
}

/** Each confirmation group an arm names, in the order the manifest names them. */
type LoadedComparisonArmGroups = readonly [
	LoadedComparisonArmEvidence,
	...LoadedComparisonArmEvidence[],
];

interface LoadedComparisonCaseEvidence {
	readonly caseId: string;
	readonly arms: Readonly<Record<ComparisonArm, LoadedComparisonArmGroups>>;
}

interface ComparisonArmEvidence {
	readonly role: ComparisonArm;
	readonly declaredCaseId: string | undefined;
	/** The arm's first group, which every other group of the arm matched. */
	readonly group: DigestedRecord<Immutable<ParsedConfirmationGroupRecord>>;
	readonly groups: readonly DigestedRecord<
		Immutable<ParsedConfirmationGroupRecord>
	>[];
	/** Every group's reps, the groups in the order the manifest names them. */
	readonly reps: readonly DigestedComparisonRep[];
	readonly executedCorpus: readonly FrozenFile[];
	readonly controlledFiles: readonly FrozenFile[];
	readonly sessionCase?: Immutable<SessionCaseDeclaration>;
	readonly sourcePaths: readonly string[];
}

interface ComparisonCaseEvidence {
	readonly caseId: string;
	readonly arms: Readonly<Record<ComparisonArm, ComparisonArmEvidence>>;
}

interface ComparisonContract {
	readonly mode: ConfirmationMode;
	readonly declaredStages: readonly string[];
	readonly reps: number;
}

interface ComparisonRepCaseInput {
	readonly caseId: string;
	readonly arms: Readonly<
		Record<ComparisonArm, readonly Immutable<ParsedConfirmationRepRecord>[]>
	>;
}

interface ComparisonProjectionInput {
	readonly contract: ComparisonContract;
	readonly cases: readonly ComparisonRepCaseInput[];
}

interface ComparisonEvidence {
	readonly manifest: {
		readonly path: string;
		readonly sha256: string;
	};
	readonly cases: readonly ComparisonCaseEvidence[];
	readonly contract: ComparisonContract;
	readonly sourcePaths: readonly string[];
}

class ComparisonEvidenceError extends RefusedPreconditionError {
	public override name = "ComparisonEvidenceError";
}

export { ComparisonEvidenceError as default };
export type {
	ComparisonArmEvidence,
	ComparisonCaseEvidence,
	ComparisonContract,
	ComparisonEvidence,
	ComparisonProjectionInput,
	ComparisonRepCaseInput,
	DigestedComparisonRep,
	DigestedRecord,
	FrozenFile,
	LoadedComparisonArmEvidence,
	LoadedComparisonArmGroups,
	LoadedComparisonCaseEvidence,
	LoadedFrozenFile,
};
