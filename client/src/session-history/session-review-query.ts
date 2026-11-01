import type { InferResponseType } from "hono/client";
import { z } from "zod";

import type { SessionReview } from "#benchmark/session-review";
import { apiClient } from "#client/api-client";

const endpoint = apiClient.api["session-reviews"][":id"];
const HTTP_OK = 200;

type SessionReviewReading = InferResponseType<
	typeof endpoint.$get,
	typeof HTTP_OK
>;

interface SessionReviewQuery {
	readonly queryKey: readonly ["session-review", string];
	readonly queryFn: () => Promise<SessionReviewReading>;
}

function sessionReviewQuery(id: string): SessionReviewQuery {
	return {
		queryFn: async (): Promise<SessionReviewReading> => {
			const response = await endpoint.$get({
				param: { id: encodeURIComponent(id) },
			});
			if (!response.ok) {
				throw new Error(
					"Human review unavailable; the saved record could not be read",
				);
			}

			return await response.json();
		},
		queryKey: ["session-review", id] as const,
	};
}

async function recordReview(
	id: string,
	review: SessionReview,
): Promise<SessionReviewReading> {
	const response = await endpoint.$post(
		{ param: { id: encodeURIComponent(id) } },
		{
			headers: { "content-type": "application/json" },
			init: { body: JSON.stringify(review) },
		},
	);
	if (!response.ok) {
		const error = z.object({ error: z.string() }).parse(await response.json());
		throw new Error(error.error);
	}

	return await response.json();
}

export { sessionReviewQuery, recordReview };
export type { SessionReviewReading };
