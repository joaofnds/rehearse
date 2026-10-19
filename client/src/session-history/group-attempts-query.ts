import type { InferResponseType } from "hono/client";

import { apiClient } from "#client/api-client";
import type HTTP_STATUS from "#client/http-status";

const route = apiClient.api.groups[":groupId"].attempts;

type GroupAttemptIndex = InferResponseType<
	typeof route.$get,
	typeof HTTP_STATUS.ok
>;

interface GroupAttemptsQuery {
	readonly queryKey: readonly ["group-attempts", string];
	readonly queryFn: () => Promise<GroupAttemptIndex>;
}

function groupAttemptsQuery(groupId: string): GroupAttemptsQuery {
	return {
		queryFn: async () => {
			const response = await route.$get({
				param: { groupId: encodeURIComponent(groupId) },
			});
			if (!response.ok) {
				throw new Error("Saved group attempts unavailable");
			}
			return await response.json();
		},
		queryKey: ["group-attempts", groupId],
	};
}

export { groupAttemptsQuery as default };
export type { GroupAttemptIndex };
