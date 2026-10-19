import type { UseQueryResult } from "@tanstack/react-query";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import type { RunRecordResponse } from "#client/monitor/run-record-query";
import { polledRunHistoryQuery } from "#client/run-history/run-history-polling";
import type { PipelineRowWithStaleness } from "#client/run-history/run-history-query";

import type { FinalAssessmentResponse } from "./investigation-query";
import { finalAssessmentQuery } from "./investigation-query";
import type { PipelineRow } from "./run-record-readings";

interface RunResultReadings {
	readonly rows: readonly PipelineRowWithStaleness[];
	readonly criteriaOpen: boolean;
	readonly setCriteriaOpen: (value: boolean) => void;
	readonly assessment: Readonly<
		Pick<
			UseQueryResult<FinalAssessmentResponse>,
			"data" | "isError" | "isLoading"
		>
	>;
	readonly finalCitations: boolean;
}

function useRunResultReadings(
	row: PipelineRow,
	record: RunRecordResponse,
): RunResultReadings {
	const history = useQuery(polledRunHistoryQuery);
	const rows = (history.data?.rows ?? []).filter(
		(each): each is PipelineRowWithStaleness => each.kind === "run",
	);
	const [criteriaOpen, setCriteriaOpen] = useState(false);
	const assessment = useQuery({
		...finalAssessmentQuery(row.run),
		enabled: record.finalOutcome.status === "JUDGED",
	});
	const finalCitations =
		assessment.data?.state === "available" &&
		assessment.data.requirements.some(({ status }) => status === "FAIL");

	return { assessment, criteriaOpen, finalCitations, rows, setCriteriaOpen };
}

export { useRunResultReadings as default };
export type { RunResultReadings };
