import { describe, expect, it } from "bun:test";

import {
	contextEvidenceSchema,
	normalizeContextEvidence,
} from "#benchmark/context-evidence";

import {
	fullUsage,
	required,
	sourceFixture,
	transcriptOnlySource,
} from "./context-evidence-test-support";

async function namesOtelAsTheRouteWhenOtelSuppliedTheUsage(): Promise<void> {
	const evidence = normalizeContextEvidence(await sourceFixture());

	const otelSupplied = evidence.projection.requests.find(
		(request) => request.requestId === "req-main-1",
	);

	expect(otelSupplied?.usageRoute).toBe("otel");
}

function reportsMissingWhenTheTranscriptRowCarriesNoUsage(): void {
	const evidence = normalizeContextEvidence(transcriptOnlySource());

	const [request] = evidence.projection.requests;

	expect(request?.usageState).toBe("missing");
	expect(request?.usageRoute).toBeUndefined();
}

async function parsesARecordWrittenBeforeTheRouteExistedWithoutAddingOne(): Promise<void> {
	const evidence = normalizeContextEvidence(await sourceFixture());
	const legacyRequests = evidence.projection.requests.map((request) => {
		const { usageRoute: _written, ...withoutRoute } = request;

		return withoutRoute;
	});

	const parsed = contextEvidenceSchema.parse({
		...evidence,
		projection: { ...evidence.projection, requests: legacyRequests },
	});

	expect(
		parsed.projection.requests.every(
			(request) => request.usageRoute === undefined,
		),
	).toBe(true);
}

async function rejectsARouteNamingEvidenceNoUsageCameFrom(): Promise<void> {
	const evidence = normalizeContextEvidence(await sourceFixture());
	const [first, ...rest] = evidence.projection.requests;
	const { usage: _dropped, ...withoutUsage } = required(
		first,
		"fixture has no requests",
	);

	expect(
		contextEvidenceSchema.safeParse({
			...evidence,
			projection: {
				...evidence.projection,
				requests: [{ ...withoutUsage, usageState: "missing" }, ...rest],
			},
		}).success,
	).toBe(false);
}

function reportsCompleteUsageWithEveryCategoryFromATranscriptCarryingNoOtelRows(): void {
	const evidence = normalizeContextEvidence(transcriptOnlySource(fullUsage));

	const [request] = evidence.projection.requests;

	expect(request?.usageState).toBe("complete");
	expect(request?.usage).toEqual({
		cacheReadTokens: 3300,
		cacheWrite1hTokens: 40,
		cacheWrite5mTokens: 400,
		cacheWriteTokens: 440,
		inputTokens: 11,
		outputTokens: 22,
	});
}

function namesTheTranscriptAsTheRouteThatSuppliedTheUsage(): void {
	const evidence = normalizeContextEvidence(transcriptOnlySource(fullUsage));

	const [request] = evidence.projection.requests;

	expect(request?.usageRoute).toBe("transcript");
}

async function downgradesDeclaredCoverageWhenARecognizedRecordIsMalformed(): Promise<void> {
	const source = await sourceFixture();
	source.files.coverage = source.files.coverage.map((entry) => ({
		...entry,
		state: "complete",
	}));
	source.files.otelLogs.push({
		attributes: "malformed",
		body: "claude_code.api_request",
		capture_ordinal: 93,
	});

	const evidence = normalizeContextEvidence(source);

	expect(evidence.projection.normalizationIssues).toContainEqual({
		code: "malformed-recognized-record",
		detail: "api_request record has no attributes",
		sourceOrdinal: 93,
		stream: "otelLogs",
	});
	expect(
		evidence.projection.coverage.find((entry) => entry.stream === "otelLogs"),
	).toEqual({
		reason: "normalization-issue",
		state: "partial",
		stream: "otelLogs",
	});
	expect(evidence.projection.accountingIssues).toContain(
		"malformed-source-record",
	);
}

async function doesNotOverwriteConflictingCoverageClaims(): Promise<void> {
	const source = await sourceFixture();
	source.files.coverage.push({ state: "complete", stream: "hooks" });

	const evidence = normalizeContextEvidence(source);

	expect(
		evidence.projection.coverage.find((entry) => entry.stream === "hooks"),
	).toEqual({
		reason: "coverage-claim-conflict",
		state: "partial",
		stream: "hooks",
	});
}

describe("transcript-supplied request usage", () => {
	it(
		"names otel as the route when otel supplied the usage",
		namesOtelAsTheRouteWhenOtelSuppliedTheUsage,
	);

	it(
		"reports missing when the transcript row carries no usage",
		reportsMissingWhenTheTranscriptRowCarriesNoUsage,
	);

	it(
		"parses a record written before the route existed, without adding one",
		parsesARecordWrittenBeforeTheRouteExistedWithoutAddingOne,
	);

	it(
		"rejects a route naming evidence no usage came from",
		rejectsARouteNamingEvidenceNoUsageCameFrom,
	);

	it(
		"reports complete usage with every category from a transcript carrying no otel rows",
		reportsCompleteUsageWithEveryCategoryFromATranscriptCarryingNoOtelRows,
	);

	it(
		"names the transcript as the route that supplied the usage",
		namesTheTranscriptAsTheRouteThatSuppliedTheUsage,
	);
});

describe(normalizeContextEvidence.name, () => {
	it(
		"downgrades declared coverage when a recognized record is malformed",
		downgradesDeclaredCoverageWhenARecognizedRecordIsMalformed,
	);

	it(
		"does not overwrite conflicting coverage claims",
		doesNotOverwriteConflictingCoverageClaims,
	);
});
