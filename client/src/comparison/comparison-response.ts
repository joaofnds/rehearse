import type { InferResponseType } from "hono/client";
import type { apiClient } from "#client/api-client";

export type ComparisonResponse = InferResponseType<
	(typeof apiClient.api.comparisons)[":digest"]["$get"],
	200
>;
