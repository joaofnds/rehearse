import { z } from "zod";

import type { ConfirmationOutcome } from "./pipeline-confirmation-record-test-reader";

const criteriaSchema = z.array(
	z.object({ rubricId: z.string(), sampleSize: z.number() }),
);
const baselinesSchema = z.array(
	z.object({
		criteria: criteriaSchema,
		judgeModel: z.string(),
	}),
);
const judgeAgreementSchema = z.object({
	baselines: baselinesSchema,
	skippedCalibrations: z.number(),
});
const totalSchema = z.object({ costUsd: z.array(z.number()) });
const resourcesSchema = z.object({
	completeReps: z.number(),
	missingMetricReps: z.number(),
	total: totalSchema,
});
const gradeDistributionSchema = z.record(z.string(), z.number());
const reliabilitySchema = z.array(
	z.object({
		gradeDistribution: gradeDistributionSchema,
		name: z.string(),
		successful: z.number(),
	}),
);

const agreementReportSchema = z.object({
	judgeAgreement: judgeAgreementSchema,
});
const resourceReportSchema = z.object({
	reliability: reliabilitySchema,
	resources: resourcesSchema,
});

type AgreementReport = z.infer<typeof agreementReportSchema>;
type ResourceReport = z.infer<typeof resourceReportSchema>;

async function readAgreementReport(
	outcome: ConfirmationOutcome,
): Promise<AgreementReport> {
	return agreementReportSchema.parse(
		JSON.parse(await Bun.file(outcome.reportFile).text()),
	);
}
async function readResourceReport(
	outcome: ConfirmationOutcome,
): Promise<ResourceReport> {
	return resourceReportSchema.parse(
		JSON.parse(await Bun.file(outcome.reportFile).text()),
	);
}
const peerReliabilitySchema = z.object({
	name: z.string(),
	successful: z.number(),
});
const peerReliabilityReportSchema = z.object({
	reliability: z.array(peerReliabilitySchema),
});
type PeerReliabilityReport = z.infer<typeof peerReliabilityReportSchema>;
async function readReliabilityReport(
	outcome: ConfirmationOutcome,
): Promise<PeerReliabilityReport> {
	return peerReliabilityReportSchema.parse(
		JSON.parse(await Bun.file(outcome.reportFile).text()),
	);
}

export { readReliabilityReport, readAgreementReport, readResourceReport };
