import { describe, expect, it } from "bun:test";

import JudgeResponseScript from "./judge-script-test-fixture";
import runSessionJudge from "./session-judge";
import {
	sessionJudgeRequest,
	sessionJudgeResponse,
} from "./session-judge-test-fixtures";

const RETRY_PROMPT_INDEX = 1;

describe("session Judge citations", () => {
	it.each([
		{ path: "missing.txt", quote: "The answer is four." },
		{ path: "reply.txt", quote: "A fabricated answer." },
		{ path: "reply*", quote: "The answer is four." },
	])(
		"rejects a citation to $path with quote $quote",
		async ({ path, quote }) => {
			const invalid = sessionJudgeResponse({ path, quote });
			const script = new JudgeResponseScript([invalid, invalid]);

			const result = await runSessionJudge(sessionJudgeRequest(script.invoke));

			expect(result).toMatchObject({
				attempts: [{ outcome: "REJECTED" }, { outcome: "REJECTED" }],
				costUsd: 0.2,
				status: "ERROR",
			});
			expect(result).not.toHaveProperty("grade");
		},
	);

	it.each(["local-checks", "check-integrity"])(
		"validates quotes for an ordinary rubric ID named %s",
		async (id) => {
			const invalid = sessionJudgeResponse({
				id,
				quote: "A fabricated answer.",
			});
			const script = new JudgeResponseScript([invalid, invalid]);
			const request = sessionJudgeRequest(script.invoke);

			const result = await runSessionJudge({
				...request,
				definition: {
					...request.definition,
					rubric: `1. \`${id}\`: Require correct work.`,
				},
			});

			expect(result.status).toBe("ERROR");
			expect(result).not.toHaveProperty("grade");
		},
	);
});

describe("session Judge citation corrections", () => {
	it("rejects local-checks as a source despite a valid quote", async () => {
		const invalid = sessionJudgeResponse({ source: "local-checks" });
		const script = new JudgeResponseScript([invalid, invalid]);

		const result = await runSessionJudge(sessionJudgeRequest(script.invoke));

		expect(result).toMatchObject({
			detail: "Session Judge cited unavailable source local-checks",
			status: "ERROR",
		});
	});

	it("accepts a corrected retry and retains both paid calls", async () => {
		const script = new JudgeResponseScript([
			sessionJudgeResponse({ path: "missing.txt" }),
			sessionJudgeResponse({ path: "reply.txt#L1" }),
		]);

		const result = await runSessionJudge(sessionJudgeRequest(script.invoke));

		expect(result).toMatchObject({
			attempts: [{ outcome: "REJECTED" }, { outcome: "ACCEPTED" }],
			costUsd: 0.2,
			status: "GRADED",
		});
		expect(script.prompts.at(RETRY_PROMPT_INDEX)).toContain(
			"Your previous response was rejected.",
		);
	});
});
