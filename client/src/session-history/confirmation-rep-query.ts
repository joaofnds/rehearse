import type { InferResponseType } from "hono/client";

import { apiClient } from "#client/api-client";
import type HTTP_STATUS from "#client/http-status";

const route = apiClient.api.groups[":groupId"].reps[":repId"].attempt.result;

type ConfirmationRepResult = InferResponseType<
	typeof route.$get,
	typeof HTTP_STATUS.ok
>;

interface ConfirmationRepQuery {
	readonly queryKey: readonly ["confirmation-rep-result", string, string];
	readonly queryFn: () => Promise<ConfirmationRepResult>;
}

function confirmationRepQuery(
	groupId: string,
	repId: string,
): ConfirmationRepQuery {
	return {
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
			return await response.json();
		},
		queryKey: ["confirmation-rep-result", groupId, repId],
	};
}

export { confirmationRepQuery as default };
export type { ConfirmationRepResult };
