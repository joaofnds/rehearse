import { z } from "zod";

import agentEvidenceSchema from "./context-evidence-agent-contract";
import {
	compactionSchema,
	instructionLoadSchema,
} from "./context-evidence-hook-contract";
import requestEvidenceSchema from "./context-evidence-request-contract";
import type { Immutable } from "./contracts";

const EMPTY_COLLECTION_LENGTH = 0;

const accountingIssueSchema = z.enum([
	"keyless-request",
	"request-identity",
	"request-model",
	"request-usage",
	"request-attribution",
	"source-coverage",
	"malformed-source-record",
]);

const normalizationIssueSchema = z
	.object({
		code: z.literal("malformed-recognized-record"),
		detail: z.string().nonempty(),
		sourceOrdinal: z.number().int().nonnegative().nullable(),
		stream: z.string().nonempty(),
	})
	.strict();

const keylessRequestSchema = z
	.object({
		occurrenceId: z.string().nonempty(),
		state: z.literal("identity-missing-no-dedup"),
	})
	.strict();

const rawApiBodySchema = z
	.object({
		bodyRef: z.string().nonempty(),
		requestId: z.null(),
		sourceOrdinal: z.number().int().nonnegative(),
		state: z.literal("unassigned-no-documented-key"),
	})
	.strict();

const evidenceCoverageSchema = z
	.object({
		reason: z.string().nonempty().optional(),
		state: z.enum(["complete", "partial", "unavailable"]),
		stream: z.string().nonempty(),
	})
	.strict();
const projectionPayloadSchema = z
	.object({
		accountingIssues: z.array(accountingIssueSchema),
		accountingState: z.enum(["complete", "incomplete"]),
		agents: z.array(agentEvidenceSchema),
		compactions: z.array(compactionSchema),
		coverage: z.array(evidenceCoverageSchema),
		instructionLoads: z.array(instructionLoadSchema),
		keylessRequests: z.array(keylessRequestSchema),
		normalizationIssues: z.array(normalizationIssueSchema),
		rawApiBodies: z.array(rawApiBodySchema),
		requests: z.array(requestEvidenceSchema),
	})
	.strict();

type ProjectionPayload = z.infer<typeof projectionPayloadSchema>;

type AccountingIssues = Set<z.infer<typeof accountingIssueSchema>>;

function requestAccountingClaims(
	projection: Immutable<ProjectionPayload>,
	expectedIssues: AccountingIssues,
): void {
	if (projection.keylessRequests.length > EMPTY_COLLECTION_LENGTH) {
		expectedIssues.add("keyless-request");
	}

	if (
		projection.requests.some((request) => request.identityState !== "complete")
	) {
		expectedIssues.add("request-identity");
	}

	if (
		projection.requests.some((request) => request.usageState !== "complete")
	) {
		expectedIssues.add("request-usage");
	}

	if (
		projection.requests.some(
			(request) =>
				request.modelState === "missing" || request.modelState === "conflict",
		)
	) {
		expectedIssues.add("request-model");
	}

	if (
		projection.requests.some(
			(request) => request.attributionState !== undefined,
		)
	) {
		expectedIssues.add("request-attribution");
	}
}

function sourceAccountingClaims(
	projection: Immutable<ProjectionPayload>,
	expectedIssues: AccountingIssues,
): void {
	if (projection.coverage.some((entry) => entry.state !== "complete")) {
		expectedIssues.add("source-coverage");
	}

	if (projection.normalizationIssues.length > EMPTY_COLLECTION_LENGTH) {
		expectedIssues.add("malformed-source-record");
	}
}

const projectionSchema = projectionPayloadSchema.superRefine(
	(projection, context) => {
		const expectedIssues = new Set<z.infer<typeof accountingIssueSchema>>();
		requestAccountingClaims(projection, expectedIssues);
		sourceAccountingClaims(projection, expectedIssues);

		const actualIssues = new Set(projection.accountingIssues);

		for (const issue of new Set([...expectedIssues, ...actualIssues])) {
			if (expectedIssues.has(issue) !== actualIssues.has(issue)) {
				context.addIssue({
					code: "custom",
					message: `accounting issue ${issue} contradicts the projection`,
					path: ["accountingIssues"],
				});
			}
		}

		if (
			(projection.accountingState === "complete") !==
			(projection.accountingIssues.length === EMPTY_COLLECTION_LENGTH)
		) {
			context.addIssue({
				code: "custom",
				message: "accounting state contradicts its issues",
				path: ["accountingState"],
			});
		}
	},
);

export { projectionSchema as default };
