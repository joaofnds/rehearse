import type {
	ParsedConfirmationGroupRecord,
	ConfirmationMode,
	ParsedConfirmationRepRecord,
} from "./confirmation-record";
import type { SessionCaseDeclaration } from "./case";
import type { Immutable } from "./contracts";
import type { ComparisonArm } from "./comparison-record";
import type { SessionAttemptRecord } from "./session-record";
import type { StageGradingRecord } from "./comparison-stage-grading";
import { RefusedPreconditionError } from "./exit-codes";

export type FrozenFile =
	ParsedConfirmationGroupRecord["inputs"]["files"][number];

export interface DigestedRecord<Record> {
	readonly path: string;
	readonly sha256: string;
	readonly record: Record;
	readonly canonicalPath?: string;
}

export interface LoadedFrozenFile {
	readonly record: FrozenFile;
	readonly text: string;
}

export interface LoadedComparisonArmEvidence {
	readonly role: ComparisonArm;
	readonly declaredCaseId: string | undefined;
	readonly group: DigestedRecord<Immutable<ParsedConfirmationGroupRecord>>;
	readonly reps: readonly DigestedComparisonRep[];
	readonly frozenFiles: readonly LoadedFrozenFile[];
	readonly sessionCase?: Immutable<SessionCaseDeclaration>;
	readonly sourcePaths: readonly string[];
}

export interface DigestedComparisonRep {
	readonly path: string;
	readonly sha256: string;
	readonly record: Immutable<ParsedConfirmationRepRecord>;
	readonly canonicalPath?: string;
	readonly attempt?: DigestedRecord<Immutable<SessionAttemptRecord>>;
	readonly scorecards?: readonly DigestedRecord<StageGradingRecord>[];
}

export interface LoadedComparisonCaseEvidence {
	readonly caseId: string;
	readonly arms: Readonly<Record<ComparisonArm, LoadedComparisonArmEvidence>>;
}

export interface ComparisonArmEvidence {
	readonly role: ComparisonArm;
	readonly declaredCaseId: string | undefined;
	readonly group: DigestedRecord<Immutable<ParsedConfirmationGroupRecord>>;
	readonly reps: readonly DigestedComparisonRep[];
	readonly executedCorpus: readonly FrozenFile[];
	readonly controlledFiles: readonly FrozenFile[];
	readonly sessionCase?: Immutable<SessionCaseDeclaration>;
	readonly sourcePaths: readonly string[];
}

export interface ComparisonCaseEvidence {
	readonly caseId: string;
	readonly arms: Readonly<Record<ComparisonArm, ComparisonArmEvidence>>;
}

export interface ComparisonContract {
	readonly mode: ConfirmationMode;
	readonly declaredStages: readonly string[];
	readonly reps: number;
}

export interface ComparisonRepCaseInput {
	readonly caseId: string;
	readonly arms: Readonly<
		Record<ComparisonArm, readonly Immutable<ParsedConfirmationRepRecord>[]>
	>;
}

export interface ComparisonProjectionInput {
	readonly contract: ComparisonContract;
	readonly cases: readonly ComparisonRepCaseInput[];
}

export interface ComparisonEvidence {
	readonly manifest: {
		readonly path: string;
		readonly sha256: string;
	};
	readonly cases: readonly ComparisonCaseEvidence[];
	readonly contract: ComparisonContract;
	readonly sourcePaths: readonly string[];
}

export class ComparisonEvidenceError extends RefusedPreconditionError {
	public override name = "ComparisonEvidenceError";
}
