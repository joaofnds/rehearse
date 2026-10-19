import { expect, it } from "bun:test";

import { RefusedPreconditionError } from "./exit-codes";
import { probeModelAvailable } from "./model-preflight";

interface FakeEnvelope {
	readonly session_id: string;
	readonly is_error: boolean;
	readonly api_error_status?: number;
	readonly result?: string;
	readonly terminal_reason?: string;
	readonly total_cost_usd?: number;
}

function fakeProbe(envelope: FakeEnvelope): () => Promise<string> {
	return async () => await Promise.resolve(JSON.stringify(envelope));
}

it("returns cleanly when the provider accepts the model", async () => {
	const evidence = await probeModelAvailable(
		"sonnet",
		fakeProbe({ is_error: false, session_id: "session-1" }),
	);

	expect(evidence).toEqual({
		missing: "preflight call metrics",
		status: "MISSING",
	});
});

it("retains the accepted probe's provider metrics", async () => {
	const evidence = await probeModelAvailable(
		"sonnet",
		async () =>
			await Promise.resolve(
				JSON.stringify({
					duration_api_ms: 80,
					duration_ms: 100,
					is_error: false,
					num_turns: 1,
					session_id: "session-1",
					total_cost_usd: 0.012,
					usage: {
						cache_creation_input_tokens: 5,
						cache_read_input_tokens: 4,
						input_tokens: 2,
						output_tokens: 3,
					},
				}),
			),
	);

	expect(evidence).toEqual({
		call: {
			metrics: {
				apiDurationMs: 80,
				cacheReadTokens: 4,
				cacheWriteTokens: 5,
				costUsd: 0.012,
				durationMs: 100,
				inputTokens: 2,
				outputTokens: 3,
				turns: 1,
			},
		},
		status: "COMPLETE",
	});
});

it("refuses naming the model and the fix when the provider rejects it", () => {
	const invoke = fakeProbe({
		api_error_status: 404,
		is_error: true,
		result:
			"There's an issue with the selected model (definitely-not-a-real-model-xyz). It may not exist or you may not have access to it.",
		session_id: "session-1",
	});

	const failure = probeModelAvailable(
		"definitely-not-a-real-model-xyz",
		invoke,
	);

	expect(failure).rejects.toBeInstanceOf(RefusedPreconditionError);
	expect(failure).rejects.toThrow("definitely-not-a-real-model-xyz");
	expect(failure).rejects.toThrow(/re-declar|entitle/u);
});

it.each(
	(
		[
			{
				_label: "a halt below the cap",
				reportedCostUsd: 0.022268,
				spend: "$0.022268",
			},
			{
				_label: "a halt past the cap",
				reportedCostUsd: 0.134,
				spend: "$0.134",
			},
			{
				_label: "a spend too small for exponent-free notation",
				reportedCostUsd: 1e-7,
				spend: "$0.0000001",
			},
		] as const
	).map(
		({ _label, reportedCostUsd, spend }) =>
			[_label, reportedCostUsd, spend] as const,
	),
)(
	"refuses naming the spend the envelope reported on %s",
	(_label, reportedCostUsd, spend) => {
		const invoke = fakeProbe({
			is_error: true,
			session_id: "session-1",
			terminal_reason: "budget_exhausted",
			total_cost_usd: reportedCostUsd,
		});

		const failure = probeModelAvailable("sonnet", invoke);

		expect(failure).rejects.toThrow(spend);
	},
);

it("refuses naming the budget and its amount, with no availability claim, when the probe exhausts its budget", () => {
	const invoke = fakeProbe({
		is_error: true,
		session_id: "session-1",
		terminal_reason: "budget_exhausted",
		total_cost_usd: 0.022268,
	});

	const failure = probeModelAvailable("sonnet", invoke);

	expect(failure).rejects.toBeInstanceOf(RefusedPreconditionError);
	expect(failure).rejects.toThrow(/budget/iu);
	expect(failure).rejects.toThrow("$0.10");
	expect(failure).rejects.not.toThrow("is not available");
});

it("names the spend as unreported when the provider reports no cost", () => {
	const invoke = fakeProbe({
		is_error: true,
		session_id: "session-1",
		terminal_reason: "budget_exhausted",
	});

	const failure = probeModelAvailable("sonnet", invoke);

	expect(failure).rejects.toThrow("did not report");
});

it("propagates a malformed probe response instead of calling it unavailable", () => {
	const failure = probeModelAvailable(
		"sonnet",
		async () => await Promise.resolve("not valid json"),
	);

	expect(failure).rejects.not.toBeInstanceOf(RefusedPreconditionError);
});
