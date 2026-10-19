import type { UseMutationResult } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { GradedStageRef, OperatorGrade } from "#benchmark/operator-grade";

import calibrationQuery from "./calibration-query";
import type { GradeRecorded, StageReview } from "./stage-review-query";
import { recordGrade, stageReviewQuery } from "./stage-review-query";

function useRecordGrade(
	stage: GradedStageRef,
): UseMutationResult<GradeRecorded, Error, OperatorGrade> {
	const queryClient = useQueryClient();
	const record = useMutation({
		mutationFn: async (operatorGrade: OperatorGrade) =>
			await recordGrade(stage, operatorGrade),
		onSuccess: async (recorded) => {
			queryClient.setQueryData(
				stageReviewQuery(stage).queryKey,
				(review: StageReview | undefined) =>
					review === undefined ? review : { ...review, ...recorded },
			);
			await queryClient.invalidateQueries({
				exact: true,
				queryKey: calibrationQuery.queryKey,
			});
		},
	});
	return record;
}

export { useRecordGrade as default };
