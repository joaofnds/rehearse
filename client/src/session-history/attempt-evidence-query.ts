import type { InferResponseType } from "hono/client";
import { apiClient } from "#client/api-client";

const route = apiClient.api["attempt-evidence"][":id"];
export type AttemptEvidenceResponse = InferResponseType<typeof route.$get, 200>;
interface AttemptEvidenceQuery {
	readonly queryKey: readonly ["attempt-evidence", string];
	readonly queryFn: () => Promise<AttemptEvidenceResponse>;
}
export function attemptEvidenceQuery(id: string): AttemptEvidenceQuery {
	return {
		queryKey: ["attempt-evidence", id],
		queryFn: async () => {
			const response = await route.$get({
				param: { id: encodeURIComponent(id) },
			});
			if (!response.ok) {
				throw new Error("Saved attempt evidence unavailable");
			}
			return response.json();
		},
	};
}
