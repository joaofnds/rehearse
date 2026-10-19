import { z } from "zod";

import {
	requestPricingSchema,
	tokenUsageSchema,
} from "./context-evidence-pricing-contract";
import type { Immutable } from "./contracts";

const NO_SOURCE_OCCURRENCES = 0;

interface RequestUsageEvidence {
	readonly usageState: "complete" | "missing" | "partial" | "conflict";
	readonly usage?: unknown;
	readonly usageRoute?: "otel" | "transcript" | undefined;
	readonly otelOccurrences: number;
	readonly transcriptOccurrences: number;
}

interface RequestRefinementContext {
	readonly addIssue: z.RefinementCtx["addIssue"];
}

function refineRequestUsage(
	request: Readonly<RequestUsageEvidence>,
	context: Readonly<RequestRefinementContext>,
): void {
	if ((request.usageState === "complete") !== (request.usage !== undefined)) {
		context.addIssue({
			code: "custom",
			message: "usage must exist exactly when usageState is complete",
			path: ["usage"],
		});
	}

	if (request.usageRoute === undefined) {
		return;
	}

	if (request.usage === undefined) {
		context.addIssue({
			code: "custom",
			message: "an evidence route requires the usage it supplied",
			path: ["usageRoute"],
		});
	}

	const observed =
		request.usageRoute === "otel"
			? request.otelOccurrences
			: request.transcriptOccurrences;
	if (observed === NO_SOURCE_OCCURRENCES) {
		context.addIssue({
			code: "custom",
			message: "an evidence route names a source the record never observed",
			path: ["usageRoute"],
		});
	}
}

const requestPayloadSchema = z
	.object({
		agentId: z.string().nonempty().nullable(),
		attributionState: z.enum(["missing", "conflict"]).optional(),
		clientRequestIds: z.array(z.string().nonempty()),
		identityState: z.enum(["complete", "single-source", "missing", "conflict"]),
		model: z.string().nonempty().nullable(),
		modelState: z.enum(["complete", "single-source", "missing", "conflict"]),
		otelOccurrences: z.number().int().nonnegative(),
		pricing: requestPricingSchema,
		providerCostUsd: z.number().nonnegative().optional(),
		requestId: z.string().nonempty(),
		sessionId: z.string().nonempty().nullable(),
		transcriptOccurrences: z.number().int().nonnegative(),
		uniqueOtelOccurrences: z.number().int().nonnegative(),
		usage: tokenUsageSchema.optional(),
		usageRoute: z.enum(["otel", "transcript"]).optional(),
		usageState: z.enum(["complete", "missing", "partial", "conflict"]),
	})
	.strict();

type RequestPayload = z.infer<typeof requestPayloadSchema>;

function refineRequestIdentity(
	request: Immutable<RequestPayload>,
	context: Readonly<RequestRefinementContext>,
): void {
	refineRequestUsage(request, context);

	if ((request.agentId === null) !== (request.attributionState !== undefined)) {
		context.addIssue({
			code: "custom",
			message: "agent attribution payload contradicts its state",
			path: ["attributionState"],
		});
	}

	if (
		(request.model === null) !==
		(request.modelState !== "complete" &&
			request.modelState !== "single-source")
	) {
		context.addIssue({
			code: "custom",
			message: "model payload contradicts its state",
			path: ["modelState"],
		});
	}
}

function refineRequestPricing(
	request: Immutable<RequestPayload>,
	context: Readonly<RequestRefinementContext>,
): void {
	if (
		request.pricing.state === "complete" &&
		(request.usage?.cacheWrite5mTokens === undefined ||
			request.usage.cacheWrite1hTokens === undefined)
	) {
		context.addIssue({
			code: "custom",
			message: "complete pricing requires the reconciled cache TTL split",
			path: ["pricing"],
		});
	}

	if (
		request.pricing.state === "complete" &&
		request.usage?.cacheWrite5mTokens !== undefined &&
		request.usage.cacheWrite1hTokens !== undefined &&
		request.usage.cacheWrite5mTokens + request.usage.cacheWrite1hTokens !==
			request.usage.cacheWriteTokens
	) {
		context.addIssue({
			code: "custom",
			message: "reconciled cache TTL split must match cache-write usage",
			path: ["usage"],
		});
	}

	if (
		request.pricing.state === "complete" &&
		request.pricing.selectedRate.model !== request.model
	) {
		context.addIssue({
			code: "custom",
			message: "selected rate must match the normalized request model",
			path: ["pricing", "selectedRate", "model"],
		});
	}
}

const requestEvidenceSchema = requestPayloadSchema.superRefine(
	(request, context) => {
		refineRequestIdentity(request, context);
		refineRequestPricing(request, context);
	},
);

export { requestEvidenceSchema as default };

export type { RequestRefinementContext };
