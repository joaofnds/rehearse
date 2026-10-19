import type { CorpusMeasurement } from "#benchmark/corpus-measurement";
import type { CaseRun } from "#server/case-figures";
import { redactAbsolutePaths } from "#server/redact-path";
import type { RunRecord } from "#server/run-record";

/** What a case's records say about it, its runs newest first. */
interface RecordedCase {
	readonly runs: readonly CaseRun[];
	readonly members: readonly CaseRunMember[];
	/** The newest pipeline run's, and undefined for a case no pipeline run ran. */
	readonly minimumGrade: RunRecord["minimumGrade"] | undefined;
}

interface CaseRunMember {
	readonly label: string;
	readonly href: string;
	readonly startedAt: string | null;
	readonly run: CaseRun;
}

interface UnreadableCaseRecord {
	readonly id: string;
	readonly reason: string;
}

interface CaseRunsReading {
	readonly cases: ReadonlyMap<string, RecordedCase>;
	readonly unreadable: readonly UnreadableCaseRecord[];
}

interface Found {
	readonly found: readonly CaseRunOf[];
	readonly unreadable: readonly UnreadableCaseRecord[];
}

interface CaseRunOf {
	readonly caseId: string;
	/** The run's name, or the start time its attempt or group recorded. */
	readonly time: string | undefined;
	readonly run: CaseRun;
	readonly label: string;
	readonly href: string;
	readonly minimumGrade?: RunRecord["minimumGrade"];
}

type RepReading =
	| { readonly state: "read"; readonly run: CaseRun }
	| { readonly state: "not-recorded" }
	| { readonly state: "unreadable"; readonly reason: string };

function digestOf(
	measurement: CorpusMeasurement | undefined,
): string | undefined {
	return measurement?.kind === "version" ? measurement.digest : undefined;
}

function unreadableRecord({
	id,
	reason,
}: UnreadableCaseRecord): UnreadableCaseRecord {
	return { id, reason: redactAbsolutePaths(reason) };
}

export { digestOf, unreadableRecord };

export type {
	RecordedCase,
	CaseRunMember,
	UnreadableCaseRecord,
	CaseRunsReading,
	Found,
	CaseRunOf,
	RepReading,
};
