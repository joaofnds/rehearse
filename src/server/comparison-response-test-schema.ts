import { z } from "zod";

import { parseComparisonReport } from "#benchmark/comparison-record";
import type {
	ComparisonReport,
	LegacyComparisonReport,
} from "#benchmark/comparison-record";

const MINIMUM_DIFFERING_PATHS = 2;

const attributableSchema = z.object({
	claim: z.literal("attributable"),
	differingPath: z.string(),
	differingPaths: z.tuple([z.string()]),
});

const refusedAttributionSchema = z.object({
	claim: z.literal("refused"),
	differingPaths: z.array(z.string()).min(MINIMUM_DIFFERING_PATHS),
});

const attributionSchema = z.discriminatedUnion("claim", [
	z.object({ claim: z.literal("identical") }),
	attributableSchema,
	refusedAttributionSchema,
]);

const qualityIntervalSchema = z
	.object({ high: z.string(), low: z.string() })
	.optional();

const insideNoiseSchema = z.object({ kind: z.literal("insideRerunNoise") });

const unchangedQualitySchema = z.object({
	kind: z.literal("unchangedAlreadyClear"),
});

const separatedQualitySchema = z.object({
	arm: z.string(),
	kind: z.literal("separated"),
});

const qualityReadingSchema = z.object({
	interval: z.object({
		minuend: qualityIntervalSchema,
		subtrahend: qualityIntervalSchema,
	}),
	verdict: z.discriminatedUnion("kind", [
		insideNoiseSchema,
		unchangedQualitySchema,
		separatedQualitySchema,
	]),
});

const armFiguresSchema = z.object({
	cost: z.unknown(),
	measures: z.record(z.string(), z.unknown()),
	words: z.unknown(),
});

const recordedAttemptsSchema = z.array(
	z
		.object({ ordinal: z.number(), repId: z.string(), words: z.unknown() })
		.loose(),
);

const caseArmFiguresSchema = z.record(z.string(), armFiguresSchema);

const caseAttributionSchema = z.record(z.string(), attributionSchema);

const caseQualityReadingsSchema = z.record(z.string(), qualityReadingSchema);

const armQualityReadingsSchema = z.record(
	z.string(),
	caseQualityReadingsSchema,
);

const movedItemSchema = z
	.object({ kind: z.string(), name: z.string() })
	.loose();

const caseSummarySchema = z.record(z.string(), z.unknown());

const comparisonResponseSchema = z.object({
	armFigures: z.record(z.string(), caseArmFiguresSchema),
	attempts: z.record(
		z.string(),
		z.object({
			baseline: recordedAttemptsSchema,
			candidate: recordedAttemptsSchema,
			control: recordedAttemptsSchema,
		}),
	),
	attribution: z.record(z.string(), caseAttributionSchema),
	qualityReadings: z.record(z.string(), armQualityReadingsSchema),
	report: z.unknown(),
	summary: z.record(z.string(), caseSummarySchema),
	whatMoved: z.record(z.string(), z.array(movedItemSchema)),
});

const baselineArmResponseSchema = z.object({
	baselineArm: z.unknown(),
});

const comparisonDigestSchema = z.object({ digest: z.string() });

const unreadableComparisonSchema = z.object({
	id: z.string(),
	reason: z.string(),
});

const comparisonIndexResponseSchema = z.object({
	comparisons: z.array(comparisonDigestSchema),
	unreadable: z.array(unreadableComparisonSchema),
});

type ComparisonResponse = Omit<
	z.infer<typeof comparisonResponseSchema>,
	"report"
> & {
	readonly report: ComparisonReport | LegacyComparisonReport;
};

async function comparisonResponseFrom(
	response: Response,
): Promise<ComparisonResponse> {
	const parsed = comparisonResponseSchema.parse(await response.json());

	return {
		...parsed,
		report: parseComparisonReport(JSON.stringify(parsed.report)),
	};
}

export {
	baselineArmResponseSchema,
	comparisonIndexResponseSchema,
	comparisonResponseFrom,
};

export type { ComparisonResponse };
