import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen } from "@testing-library/react";

import runSessionJudge from "#benchmark/session-judge";
import {
	sessionJudgeRequest,
	sessionJudgeResponse,
} from "#benchmark/session-judge-test-fixtures";

import { originalFetch, showSession } from "./attempt-evidence-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("saved session Judge", () => {
	it("shows a quality failure beside passing checks and discloses its quoted evidence", async () => {
		const judge = await runSessionJudge(
			sessionJudgeRequest(
				async () =>
					await Promise.resolve(sessionJudgeResponse({ status: "FAIL" })),
			),
		);

		showSession({
			caseId: "case-a",
			checks: [
				{ detail: "Within the word limit", kind: "word-band", status: "PASS" },
			],
			judge,
			outcome: "SUCCESSFUL",
			reply: "The answer is four.",
		});

		expect(await screen.findByText("Session Judge: FAIL")).toBeInTheDocument();
		expect(
			screen.getByText("Recorded outcome: SUCCESSFUL"),
		).toBeInTheDocument();
		expect(
			screen.getByText(/This Judge assesses quality separately/u),
		).toBeInTheDocument();
		fireEvent.click(
			screen.getByText("reply.txt: The reply answers the question."),
		);
		expect(
			screen.getByText("The answer is four.", { selector: "blockquote" }),
		).toBeVisible();
	});
});
