import type { Immutable } from "#benchmark/contracts";
import type { ConfirmationRepResult as RepResult } from "#client/session-history/confirmation-rep-query";

import type { GroupRow } from "./group-workspace-contract";

function repStageReading(
	item: Immutable<RepResult["stages"][number]>,
	mode: GroupRow["mode"],
): string {
	if (item.status !== "JUDGED") {
		return item.status.replaceAll("_", " ");
	}
	if (mode === "session") {
		return item.verdict === "CONTINUE"
			? "Reply/transcript checks passed"
			: "Reply/transcript checks failed";
	}
	return `Grade ${item.grade} · ${item.verdict}`;
}

function repCoverage(rep: Immutable<RepResult> | undefined): string {
	if (rep === undefined) {
		return "Evidence unavailable";
	}
	return rep.metrics.status === "COMPLETE"
		? "Call metrics complete"
		: rep.metrics.missing.join("; ");
}

interface RepOutcomesProps {
	readonly rep: Immutable<RepResult> | undefined;
	readonly loading: boolean;
	readonly mode: GroupRow["mode"];
}

function RepOutcomes({
	rep,
	loading,
	mode,
}: RepOutcomesProps): React.JSX.Element {
	if (rep === undefined) {
		return <>{loading ? "Reading…" : "Result unavailable"}</>;
	}
	return (
		<>
			<p>Recorded outcome: {rep.outcome}</p>
			{rep.stages.map((item) => (
				<p key={item.stage}>
					{item.stage}: {repStageReading(item, mode)}
				</p>
			))}
		</>
	);
}

export { repCoverage, RepOutcomes };
