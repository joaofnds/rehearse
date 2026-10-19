import type { Checkpoint } from "#benchmark/compare-attempts";
import type {
	ComparisonArm,
	ComparisonReport,
	LegacyComparisonReport,
} from "#benchmark/comparison-record";
import type { CorpusMeasurement } from "#benchmark/corpus-measurement";

import type { Reading } from "./run-record";

type AnyComparisonReport = ComparisonReport | LegacyComparisonReport;

type ReportCase = AnyComparisonReport["cases"][number];

type ArmSource = ReportCase["arms"][ComparisonArm]["source"];

type ArmCorpusVersion = Reading<{ readonly digest: string }>;

/** The checkpoint every arm replayed, with its short id once its run holds one. */
type ComparedCheckpoint = Checkpoint & { readonly shortId?: string };

/** Where a comparison's arms came from, which its report does not carry. */
interface ComparisonProvenance {
	readonly checkpoint: Reading<ComparedCheckpoint>;
	readonly corpusVersions: Readonly<
		Record<string, Readonly<Record<ComparisonArm, ArmCorpusVersion>>>
	>;
}

interface RecordedGroup {
	readonly groupId: string;
	readonly corpusVersion: CorpusMeasurement | undefined;
}

type ArmGroups = Reading<{ readonly groups: readonly RecordedGroup[] }>;

interface CaseGroups {
	readonly caseId: string;
	readonly arms: Readonly<Record<ComparisonArm, ArmGroups>>;
}

export type {
	AnyComparisonReport,
	ReportCase,
	ArmSource,
	ArmCorpusVersion,
	ComparedCheckpoint,
	ComparisonProvenance,
	RecordedGroup,
	ArmGroups,
	CaseGroups,
};
