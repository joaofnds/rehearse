import { afterEach, describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { z } from "zod";

import { ApiTestWorkspace } from "#server/api-test-workspace";

const runningRowSchema = z.object({ run: z.string().optional() }).loose();

const workspace = new ApiTestWorkspace();

afterEach(async () => {
	await workspace.dispose();
});

describe("GET /api/run-listing", () => {
	it(
		"answers a run in flight without judging staleness, while the corpus source cannot be read",
		verifyAnswersARunInFlightWithoutJudgingStalenessWhile,
	);
});

async function verifyAnswersARunInFlightWithoutJudgingStalenessWhile(): Promise<void> {
	const { fixture, app } = await workspace.runningWithoutCorpus();

	const response = await app.read("/api/run-listing");
	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	const body = z
		.object({
			rows: z.array(runningRowSchema),
		})
		.parse(await response.json());

	const running = body.rows.find((row) => row.run === fixture.runningRun);
	expect(running).toMatchObject({ status: "RUNNING" });
	expect(running).not.toHaveProperty("staleness");
}
