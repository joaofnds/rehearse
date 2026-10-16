import type { InferResponseType } from "hono/client";
import { apiClient } from "#client/api-client";

const route = apiClient.api.groups[":groupId"].attempts;
export type GroupAttemptIndex = InferResponseType<typeof route.$get, 200>;
interface GroupAttemptsQuery {
	readonly queryKey: readonly ["group-attempts", string];
	readonly queryFn: () => Promise<GroupAttemptIndex>;
}
export function groupAttemptsQuery(groupId: string): GroupAttemptsQuery {
	return {
		queryKey: ["group-attempts", groupId],
		queryFn: async () => {
			const response = await route.$get({
				param: { groupId: encodeURIComponent(groupId) },
			});
			if (!response.ok) {
				throw new Error("Saved group attempts unavailable");
			}
			return response.json();
		},
	};
}
