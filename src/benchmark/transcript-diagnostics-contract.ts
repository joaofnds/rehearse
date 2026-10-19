import { z } from "zod";

import type { Immutable } from "./contracts";
import type { repeatedBashCommandSchema } from "./transcript-diagnostic-shapes";
import {
	diagnosticIssueSchema,
	locationPrecedes,
	transcriptObservationFields,
} from "./transcript-diagnostic-shapes";

const EMPTY_COLLECTION_LENGTH = 0;
const REQUIRED_TEXT_MINIMUM_CODE_UNITS = 1;
const EMPTY_COUNT_TOTAL = 0;
const TOOL_OCCURRENCE_INDEX_STEP = 1;
const PREVIOUS_ELEMENT_OFFSET = 1;
const FIRST_COMMAND_OCCURRENCE_INDEX = 0;
const PREVIOUS_COMMAND_GROUP_INDEX_OFFSET = 1;

const transcriptDiagnosticsBaseSchema = z.discriminatedUnion("state", [
	z
		.object({
			state: z.literal("complete"),
			...transcriptObservationFields,
			issues: z.array(diagnosticIssueSchema).length(EMPTY_COLLECTION_LENGTH),
		})
		.strict(),
	z
		.object({
			state: z.literal("partial"),
			...transcriptObservationFields,
			issues: z
				.array(diagnosticIssueSchema)
				.min(REQUIRED_TEXT_MINIMUM_CODE_UNITS),
		})
		.strict(),
	z
		.object({
			prefixLinesExcluded: z.number().int().nonnegative(),
			state: z.literal("unavailable"),
		})
		.strict(),
]);

type DiagnosticsValue = z.infer<typeof transcriptDiagnosticsBaseSchema>;

type ObservedDiagnostics = Exclude<DiagnosticsValue, { state: "unavailable" }>;

interface DiagnosticValidationContext {
	readonly addIssue: z.RefinementCtx["addIssue"];
}

function validateToolUseCounts(
	diagnostics: Immutable<ObservedDiagnostics>,
	context: DiagnosticValidationContext,
): void {
	const namedTotal = diagnostics.toolUseOccurrences.byName.reduce(
		(total, tool) => total + tool.count,
		EMPTY_COUNT_TOTAL,
	);
	if (namedTotal !== diagnostics.toolUseOccurrences.total) {
		context.addIssue({
			code: "custom",
			message: "Per-tool occurrence counts must sum to the total",
			path: ["toolUseOccurrences"],
		});
	}
	const names = diagnostics.toolUseOccurrences.byName.map(({ name }) => name);
	if (new Set(names).size !== names.length) {
		context.addIssue({
			code: "custom",
			message: "Per-tool occurrence names must be unique",
			path: ["toolUseOccurrences", "byName"],
		});
	}
}

interface RepeatedCommandValidation {
	readonly group: Immutable<z.infer<typeof repeatedBashCommandSchema>>;
	readonly groupIndex: number;
}

function validateRepeatedOccurrences(
	{ group, groupIndex }: RepeatedCommandValidation,
	context: DiagnosticValidationContext,
): void {
	const ids = group.occurrences.map(({ toolUseId }) => toolUseId);
	if (new Set(ids).size !== ids.length) {
		context.addIssue({
			code: "custom",
			message: "Repeated commands require distinct tool-use IDs",
			path: ["repeatedBashCommands", groupIndex, "occurrences"],
		});
	}
	for (
		let index = 1;
		index < group.occurrences.length;
		index += TOOL_OCCURRENCE_INDEX_STEP
	) {
		const previous = group.occurrences[index - PREVIOUS_ELEMENT_OFFSET];
		const current = group.occurrences[index];
		if (
			previous !== undefined &&
			current !== undefined &&
			!locationPrecedes(previous.location, current.location)
		) {
			context.addIssue({
				code: "custom",
				message: "Repeated-command occurrences must follow source order",
				path: ["repeatedBashCommands", groupIndex, "occurrences", index],
			});
		}
	}
}

function validateRepeatedCommands(
	diagnostics: Immutable<ObservedDiagnostics>,
	context: DiagnosticValidationContext,
): void {
	for (const [
		groupIndex,
		group,
	] of diagnostics.repeatedBashCommands.entries()) {
		validateRepeatedOccurrences({ group, groupIndex }, context);
		const first = group.occurrences[FIRST_COMMAND_OCCURRENCE_INDEX]?.location;
		const previousGroup =
			diagnostics.repeatedBashCommands[
				groupIndex - PREVIOUS_COMMAND_GROUP_INDEX_OFFSET
			]?.occurrences[FIRST_COMMAND_OCCURRENCE_INDEX]?.location;
		if (
			previousGroup !== undefined &&
			first !== undefined &&
			!locationPrecedes(previousGroup, first)
		) {
			context.addIssue({
				code: "custom",
				message: "Repeated-command groups must follow source order",
				path: ["repeatedBashCommands", groupIndex],
			});
		}
	}
}

function refineTranscriptDiagnostics(
	diagnostics: Immutable<DiagnosticsValue>,
	context: DiagnosticValidationContext,
): void {
	if (diagnostics.state === "unavailable") {
		return;
	}
	validateToolUseCounts(diagnostics, context);
	validateRepeatedCommands(diagnostics, context);
}

const transcriptDiagnosticsSchema = transcriptDiagnosticsBaseSchema.superRefine(
	refineTranscriptDiagnostics,
);

type TranscriptDiagnostics = z.infer<typeof transcriptDiagnosticsSchema>;

export {
	transcriptLocationSchema,
	diagnosticIssueKindSchema,
	repeatedBashCommandSchema,
	observedToolUseCountsSchema,
	toolErrorSchema,
	MAX_PREVIEW_CODE_UNITS,
	diagnosticIssueSchema,
} from "./transcript-diagnostic-shapes";

export type { TranscriptLocation } from "./transcript-diagnostic-shapes";

export { transcriptDiagnosticsSchema };

export type { TranscriptDiagnostics };
