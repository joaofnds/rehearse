import { z } from "zod";

import {
	comparisonArmSchema,
	currentSessionSourceRepSchema,
	currentSourceRepSchema,
	digestedPathSchema,
	identitySchema,
	sessionSourceRepSchema,
	sourceRepSchema,
} from "./comparison-record-source-schema";
import {
	armResourcesSchema,
	currentArmResourcesSchema,
	reliabilitySummarySchema,
} from "./comparison-report-metrics-schema";

const reportArmSchema = z
	.object({
		executedCorpus: z.array(digestedPathSchema).nonempty(),
		quality: z.array(reliabilitySummarySchema).nonempty(),
		resources: armResourcesSchema,
		role: comparisonArmSchema,
		source: z
			.object({
				group: digestedPathSchema,
				reps: z.array(sourceRepSchema).nonempty(),
			})
			.strict(),
	})
	.strict();

const sessionReportArmSchema = z
	.object({
		executedCorpus: z.array(digestedPathSchema),
		quality: z.array(reliabilitySummarySchema).nonempty(),
		resources: armResourcesSchema,
		role: comparisonArmSchema,
		source: z
			.object({
				group: digestedPathSchema,
				reps: z.array(sessionSourceRepSchema).nonempty(),
			})
			.strict(),
	})
	.strict();

const versionFourReportArmSchema = reportArmSchema
	.extend({
		source: z
			.object({
				group: digestedPathSchema,
				reps: z.array(currentSourceRepSchema).nonempty(),
			})
			.strict(),
	})
	.strict();

const versionFourSessionReportArmSchema = sessionReportArmSchema
	.extend({
		source: z
			.object({
				group: digestedPathSchema,
				reps: z.array(currentSessionSourceRepSchema).nonempty(),
			})
			.strict(),
	})
	.strict();

const versionFiveReportArmSchema = versionFourReportArmSchema
	.extend({ resources: currentArmResourcesSchema })
	.strict();

const versionFiveSessionReportArmSchema = versionFourSessionReportArmSchema
	.extend({ resources: currentArmResourcesSchema })
	.strict();

const reportCaseSchema = z
	.object({
		arms: z
			.object({
				baseline: reportArmSchema,
				candidate: reportArmSchema,
				control: reportArmSchema,
			})
			.strict(),
		caseId: identitySchema,
	})
	.strict();

const sessionReportCaseSchema = z
	.object({
		arms: z
			.object({
				baseline: sessionReportArmSchema,
				candidate: sessionReportArmSchema,
				control: sessionReportArmSchema,
			})
			.strict(),
		caseId: identitySchema,
	})
	.strict();

const versionFourReportCaseSchema = reportCaseSchema
	.extend({
		arms: z
			.object({
				baseline: versionFourReportArmSchema,
				candidate: versionFourReportArmSchema,
				control: versionFourReportArmSchema,
			})
			.strict(),
	})
	.strict();

const versionFourSessionReportCaseSchema = sessionReportCaseSchema
	.extend({
		arms: z
			.object({
				baseline: versionFourSessionReportArmSchema,
				candidate: versionFourSessionReportArmSchema,
				control: versionFourSessionReportArmSchema,
			})
			.strict(),
	})
	.strict();

const versionFiveReportCaseSchema = reportCaseSchema
	.extend({
		arms: z
			.object({
				baseline: versionFiveReportArmSchema,
				candidate: versionFiveReportArmSchema,
				control: versionFiveReportArmSchema,
			})
			.strict(),
	})
	.strict();

const versionFiveSessionReportCaseSchema = sessionReportCaseSchema
	.extend({
		arms: z
			.object({
				baseline: versionFiveSessionReportArmSchema,
				candidate: versionFiveSessionReportArmSchema,
				control: versionFiveSessionReportArmSchema,
			})
			.strict(),
	})
	.strict();

const currentSourceGroupsSchema = z.array(digestedPathSchema).nonempty();

const groupedSourceRepSchema = currentSourceRepSchema
	.extend({ group: z.number().int().nonnegative() })
	.strict();

const currentReportArmSchema = versionFiveReportArmSchema
	.extend({
		source: z
			.object({
				groups: currentSourceGroupsSchema,
				reps: z.array(groupedSourceRepSchema).nonempty(),
			})
			.strict(),
	})
	.strict();

const groupedSessionSourceRepSchema = currentSessionSourceRepSchema
	.extend({ group: z.number().int().nonnegative() })
	.strict();

const currentSessionReportArmSchema = versionFiveSessionReportArmSchema
	.extend({
		source: z
			.object({
				groups: currentSourceGroupsSchema,
				reps: z.array(groupedSessionSourceRepSchema).nonempty(),
			})
			.strict(),
	})
	.strict();

const currentReportCaseSchema = reportCaseSchema
	.extend({
		arms: z
			.object({
				baseline: currentReportArmSchema,
				candidate: currentReportArmSchema,
				control: currentReportArmSchema,
			})
			.strict(),
	})
	.strict();

const currentSessionReportCaseSchema = sessionReportCaseSchema
	.extend({
		arms: z
			.object({
				baseline: currentSessionReportArmSchema,
				candidate: currentSessionReportArmSchema,
				control: currentSessionReportArmSchema,
			})
			.strict(),
	})
	.strict();

export {
	currentReportCaseSchema,
	currentSessionReportCaseSchema,
	reportCaseSchema,
	sessionReportCaseSchema,
	versionFiveReportCaseSchema,
	versionFiveSessionReportCaseSchema,
	versionFourReportCaseSchema,
	versionFourSessionReportCaseSchema,
};
