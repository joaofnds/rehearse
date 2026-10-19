import { ZodError } from "zod";

import type {
	ComparisonArm,
	ComparisonReport,
	LegacyComparisonReport,
} from "#benchmark/comparison-record";
import StaleComparisonHistoryError from "#server/comparison-history-contract";
import type {
	ComparisonAttemptHistoryLink,
	ComparisonAttemptHistoryLinks,
	ComparisonAttemptLinkRequest,
} from "#server/comparison-history-contract";
import ownedComparisonHistoryLink from "#server/comparison-history-source";
import { SessionHistoryReaderError } from "#server/session-history-reader";

async function comparisonAttemptHistoryLink(
	request: ComparisonAttemptLinkRequest,
): Promise<ComparisonAttemptHistoryLink> {
	try {
		return await ownedComparisonHistoryLink(request);
	} catch (error) {
		if (
			!(error instanceof StaleComparisonHistoryError) &&
			!(error instanceof SessionHistoryReaderError) &&
			!(error instanceof ZodError)
		) {
			throw error;
		}
		return {
			ordinal: request.rep.ordinal,
			repId: request.rep.repId,
			status: "stale",
		};
	}
}

type SessionReportSource = Extract<
	ComparisonReport | LegacyComparisonReport,
	{ readonly mode: "session" }
>["cases"][number]["arms"][ComparisonArm]["source"];

/** Each attempt beside the group it was recorded in. */
function groupedReps(
	source: SessionReportSource,
): readonly Omit<ComparisonAttemptLinkRequest, "runsDirectory" | "caseId">[] {
	if ("group" in source) {
		return source.reps.map((rep) => ({ group: source.group, rep }));
	}

	return source.groups.flatMap((group, index) =>
		source.reps
			.filter((rep) => rep.group === index)
			.map((rep) => ({ group, rep })),
	);
}

async function comparisonAttemptHistoryLinks(
	report: ComparisonReport | LegacyComparisonReport,
	runsDirectory: string,
): Promise<ComparisonAttemptHistoryLinks> {
	if (report.mode !== "session") {
		return {};
	}
	const links: Record<
		string,
		Record<ComparisonArm, readonly ComparisonAttemptHistoryLink[]>
	> = {};
	await Array.fromAsync([...report.cases], async (benchmarkCase) => {
		const linksForArm = async (
			arm: ComparisonArm,
		): Promise<readonly ComparisonAttemptHistoryLink[]> =>
			await Promise.all(
				groupedReps(benchmarkCase.arms[arm].source).map(
					async ({ group, rep }) =>
						await comparisonAttemptHistoryLink({
							caseId: benchmarkCase.caseId,
							group,
							rep,
							runsDirectory,
						}),
				),
			);
		links[benchmarkCase.caseId] = {
			baseline: await linksForArm("baseline"),
			candidate: await linksForArm("candidate"),
			control: await linksForArm("control"),
		};
	});

	return links;
}

export { comparisonAttemptHistoryLink, comparisonAttemptHistoryLinks };
export type {
	ComparisonAttemptHistoryLink,
	ComparisonAttemptHistoryLinks,
	ComparisonAttemptLinkRequest,
} from "#server/comparison-history-contract";
