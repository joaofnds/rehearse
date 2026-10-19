import type { InferResponseType } from "hono/client";

import { apiClient } from "#client/api-client";
import HTTP_STATUS from "#client/http-status";
import RecordNotFoundError from "#client/record-not-found";

type ComparisonResponse = InferResponseType<
	(typeof apiClient.api.comparisons)[":digest"]["$get"],
	typeof HTTP_STATUS.ok
>;

class ComparisonNotFoundError extends RecordNotFoundError {
	public override name = "ComparisonNotFoundError";
}

async function fetchComparison(digest: string): Promise<ComparisonResponse> {
	const response = await apiClient.api.comparisons[":digest"].$get({
		param: { digest },
	});
	if (response.status === HTTP_STATUS.notFound) {
		throw new ComparisonNotFoundError(`No comparison recorded for ${digest}`);
	}
	if (!response.ok) {
		throw new Error(`Could not load comparison ${digest}`);
	}

	return await response.json();
}

type ArmDiffResponse = InferResponseType<
	(typeof apiClient.api.comparisons)[":digest"]["arm-diff"]["$get"],
	typeof HTTP_STATUS.ok
>;

async function fetchArmDiff(digest: string): Promise<ArmDiffResponse> {
	const response = await apiClient.api.comparisons[":digest"]["arm-diff"].$get({
		param: { digest },
	});
	if (!response.ok) {
		throw new Error(`Could not load the diff between arms of ${digest}`);
	}

	return await response.json();
}

export { ComparisonNotFoundError, fetchComparison, fetchArmDiff };
export type { ComparisonResponse, ArmDiffResponse };
