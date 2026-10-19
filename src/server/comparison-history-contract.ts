import type { ComparisonArm } from "#benchmark/comparison-record";

type ComparisonAttemptHistoryLink =
	| {
			readonly status: "available";
			readonly groupId: string;
			readonly repId: string;
			readonly ordinal: number;
			readonly href: string;
	  }
	| {
			readonly status: "stale";
			readonly repId: string;
			readonly ordinal: number;
	  };

type ComparisonAttemptHistoryLinks = Readonly<
	Record<
		string,
		Readonly<Record<ComparisonArm, readonly ComparisonAttemptHistoryLink[]>>
	>
>;

interface DigestedPath {
	readonly path: string;
	readonly sha256: string;
}

interface ComparisonAttemptLinkRequest {
	readonly runsDirectory: string;
	readonly caseId: string;
	readonly group: DigestedPath;
	readonly rep: DigestedPath & {
		readonly repId: string;
		readonly ordinal: number;
		readonly attempt: DigestedPath;
	};
}

class StaleComparisonHistoryError extends Error {
	public override name = "StaleComparisonHistoryError";
}
export { StaleComparisonHistoryError as default };
export type {
	ComparisonAttemptHistoryLink,
	ComparisonAttemptHistoryLinks,
	ComparisonAttemptLinkRequest,
};
