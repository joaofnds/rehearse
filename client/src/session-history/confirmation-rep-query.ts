import type { InferResponseType } from "hono/client";
import { apiClient } from "#client/api-client";

const route = apiClient.api.groups[":groupId"].reps[":repId"].attempt.result;
export type ConfirmationRepResult = InferResponseType<typeof route.$get, 200>;
interface ConfirmationRepQuery {
	readonly queryKey: readonly ["confirmation-rep-result", string, string];
	readonly queryFn: () => Promise<ConfirmationRepResult>;
}
export function confirmationRepQuery(
	groupId: string,
	repId: string,
): ConfirmationRepQuery {
	return {
		queryKey: ["confirmation-rep-result", groupId, repId],
		queryFn: async () => {
			const response = await route.$get({
				param: {
					groupId: encodeURIComponent(groupId),
					repId: encodeURIComponent(repId),
				},
			});
			if (!response.ok) {
				throw new Error(
					`Individual rep result unavailable (${String(response.status)})`,
				);
			}
			return response.json();
		},
	};
}
