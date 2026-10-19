import type { InferResponseType } from "hono/client";

import { apiClient } from "#client/api-client";
import type HTTP_STATUS from "#client/http-status";

const route = apiClient.api["attempt-evidence"][":id"];

type AttemptEvidenceResponse = InferResponseType<
	typeof route.$get,
	typeof HTTP_STATUS.ok
>;

interface AttemptEvidenceQuery {
	readonly queryKey: readonly ["attempt-evidence", string];
	readonly queryFn: () => Promise<AttemptEvidenceResponse>;
}

function attemptEvidenceQuery(id: string): AttemptEvidenceQuery {
	return {
		queryFn: async () => {
			const response = await route.$get({
				param: { id: encodeURIComponent(id) },
			});
			if (!response.ok) {
				throw new Error("Saved attempt evidence unavailable");
			}
			return await response.json();
		},
		queryKey: ["attempt-evidence", id],
	};
}

export { attemptEvidenceQuery as default };
export type { AttemptEvidenceResponse };
