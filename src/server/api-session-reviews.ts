import { Hono } from "hono";
import type { Context } from "hono";
import { ZodError } from "zod";

import { InvalidSessionReviewError } from "#benchmark/session-review";
import { UsageError } from "#cli/commands";
import { commandRefusal, historyError } from "#server/api-refusal";
import type { CalibrationDependencies } from "#server/calibration-contract";
import { CalibrationRefusalError } from "#server/calibration-contract";
import {
	HTTP_STATUS_BAD_REQUEST,
	HTTP_STATUS_CREATED,
} from "#server/http-status";
import routes from "#server/route-factory";
import { SessionHistoryReaderError } from "#server/session-history-reader";
import {
	readSessionReview,
	recordSessionReview,
	sessionReviewFrom,
} from "#server/session-review";

function reviewError(
	caughtError: Readonly<Error>,
	context: Readonly<Pick<Context, "json">>,
): Response {
	if (caughtError instanceof CalibrationRefusalError) {
		return context.json({ error: caughtError.message }, caughtError.status);
	}
	if (
		caughtError instanceof SessionHistoryReaderError ||
		caughtError instanceof UsageError
	) {
		const response =
			caughtError instanceof UsageError
				? commandRefusal(caughtError)
				: historyError(caughtError);
		return context.json({ error: response.message }, response.status);
	}
	if (caughtError instanceof InvalidSessionReviewError) {
		return context.json(
			{ error: caughtError.message },
			HTTP_STATUS_BAD_REQUEST,
		);
	}
	if (caughtError instanceof ZodError || caughtError instanceof SyntaxError) {
		return context.json(
			{ error: "The saved session or review is unreadable" },
			HTTP_STATUS_BAD_REQUEST,
		);
	}

	throw new Error(caughtError.message, { cause: caughtError });
}

const sessionReviewsApi = routes(
	({ runsDirectory }: CalibrationDependencies) => {
		const app = new Hono()
			.get("/api/session-reviews/:id", async (context) =>
				context.json(
					await readSessionReview({
						id: context.req.param("id"),
						runsDirectory,
					}),
				),
			)
			.post("/api/session-reviews/:id", async (context) => {
				const review = sessionReviewFrom(await context.req.text());
				const reading = await recordSessionReview(
					{ id: context.req.param("id"), runsDirectory },
					review,
					new Date().toISOString(),
				);
				return context.json(reading, HTTP_STATUS_CREATED);
			});
		app.onError(reviewError);

		return app;
	},
);

export { sessionReviewsApi as default };
