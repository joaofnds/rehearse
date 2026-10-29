import type { RequestSeriesResponse } from "./history-report-query";

const REQUEST_READING: RequestSeriesResponse = {
	cost: {
		calculated: {
			costUsd: 2.25,
			pricedRequestCount: 3,
			reasons: ["a request's duplicate rows disagree on usage"],
			requestCount: 4,
			state: "incomplete",
		},
		difference: {
			costUsd: 0.25,
			pricedRequestCount: 3,
			reasons: ["a reading it is drawn from is incomplete"],
			requestCount: 4,
			state: "incomplete",
		},
		reported: { costUsd: 2.5, state: "complete" },
		rootRequests: {
			costUsd: 2.25,
			pricedRequestCount: 3,
			reasons: ["a request's duplicate rows disagree on usage"],
			requestCount: 4,
			state: "incomplete",
		},
	},
	instructionLoads: {
		loads: [
			{
				filePath: "<path>/**bold**/<script>alert(1)</script>.md",
				loadReason: { state: "unavailable" },
				memoryType: "User",
				parentFilePath: { state: "unavailable" },
				triggerFilePath: { state: "unavailable" },
			},
		],
		state: "available",
	},
	requestCosts: [
		{ cost: { costUsd: 1.5, state: "priced" }, line: 2 },
		{ cost: { costUsd: 0.75, state: "priced" }, line: 3 },
		{ cost: { costUsd: 0, state: "priced" }, line: 4 },
		{
			cost: {
				reason: "a request's duplicate rows disagree on usage",
				state: "unpriced",
			},
			line: 5,
		},
	],
	series: {
		attemptTotals: {
			requestCount: 4,
			state: "complete",
			totalInputTokens: 566_869,
			usage: {
				cacheReadTokens: 150,
				cacheWriteTokens: 566_711,
				inputTokens: 8,
				outputTokens: 191,
			},
		},
		boundary: "known",
		compactions: [{ line: 6, region: "attempt", trigger: "auto" }],
		entries: [
			{
				cacheWriteSplit: {
					fiveMinuteTokens: 0,
					oneHourTokens: 13,
					state: "complete",
				},
				cumulativeTotalInputTokens: 31,
				line: 1,
				model: "claude-opus-5",
				region: "starting-context",
				requestId: "req-inherited",
				totalInputTokens: 31,
				usage: {
					cacheReadTokens: 11,
					cacheWriteTokens: 13,
					inputTokens: 7,
					outputTokens: 9,
				},
				usageState: "complete",
			},
			{
				cacheWriteSplit: {
					fiveMinuteTokens: 0,
					oneHourTokens: 286_711,
					state: "complete",
				},
				cumulativeTotalInputTokens: 286_844,
				line: 2,
				model: "claude-sonnet-5",
				region: "attempt",
				requestId: "req-first",
				totalInputTokens: 286_813,
				usage: {
					cacheReadTokens: 100,
					cacheWriteTokens: 286_711,
					inputTokens: 2,
					outputTokens: 151,
				},
				usageState: "complete",
			},
			{
				cacheWriteSplit: {
					fiveMinuteTokens: 0,
					oneHourTokens: 280_000,
					state: "complete",
				},
				cumulativeTotalInputTokens: 566_900,
				line: 3,
				model: "claude-sonnet-5",
				region: "attempt",
				requestId: "req-second",
				totalInputTokens: 280_056,
				usage: {
					cacheReadTokens: 50,
					cacheWriteTokens: 280_000,
					inputTokens: 6,
					outputTokens: 40,
				},
				usageState: "complete",
			},
			{
				cacheWriteSplit: {
					fiveMinuteTokens: 0,
					oneHourTokens: 0,
					state: "complete",
				},
				cumulativeTotalInputTokens: 566_900,
				line: 4,
				model: "<synthetic>",
				region: "attempt",
				requestId: undefined,
				totalInputTokens: 0,
				usage: {
					cacheReadTokens: 0,
					cacheWriteTokens: 0,
					inputTokens: 0,
					outputTokens: 0,
				},
				usageState: "complete",
			},
			{
				line: 5,
				region: "attempt",
				requestId: "req-conflict",
				usageState: "conflict",
			},
		],
		measuresActiveContextWindow: false,
		name: "total input tokens",
		omits: [
			"the request's own output tokens",
			"the model's context window limit, which the transcript does not carry",
		],
		transcriptState: "saved",
	},
};

export { REQUEST_READING as default };
