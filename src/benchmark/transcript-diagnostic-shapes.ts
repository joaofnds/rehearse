import { z } from "zod";

const MIN_REPEATED_COMMAND_OCCURRENCES = 2;

const transcriptLocationSchema = z
	.object({
		block: z.number().int().positive(),
		line: z.number().int().positive(),
	})
	.strict();

type TranscriptLocation = z.infer<typeof transcriptLocationSchema>;

const diagnosticIssueKindSchema = z.enum([
	"empty-measured-transcript",
	"invalid-json",
	"invalid-message-content",
	"unsupported-content-block",
	"invalid-tool-use",
	"invalid-tool-result",
	"missing-tool-use-id",
	"duplicate-tool-use-id",
	"missing-tool-result-id",
	"duplicate-tool-result",
	"unmatched-tool-result",
	"missing-tool-result",
	"invalid-bash-command",
]);

const diagnosticIssueSchema = z
	.object({
		kind: diagnosticIssueKindSchema,
		locations: z.array(transcriptLocationSchema),
		locationsTruncated: z.boolean(),
		occurrences: z.number().int().positive(),
	})
	.strict();

const toolNameCountSchema = z
	.object({
		count: z.number().int().positive(),
		name: z.string().nonempty(),
	})
	.strict();

const observedToolUseCountsSchema = z
	.object({
		byName: z.array(toolNameCountSchema),
		total: z.number().int().nonnegative(),
	})
	.strict();

const MAX_PREVIEW_CODE_UNITS = 160;

const toolErrorSchema = z
	.object({
		call: transcriptLocationSchema.optional(),
		result: transcriptLocationSchema,
		toolName: z.string().nonempty().optional(),
		toolUseId: z.string().nonempty().optional(),
	})
	.strict();

const bashInputOccurrenceSchema = z
	.object({
		location: transcriptLocationSchema,
		toolUseId: z.string().nonempty(),
	})
	.strict();

const repeatedBashCommandSchema = z
	.object({
		commandCharacters: z.number().int().nonnegative(),
		commandSha256: z
			.string()
			.regex(/^[0-9a-f]{64}$/u, "Invalid SHA-256 digest"),
		occurrences: z
			.array(bashInputOccurrenceSchema)
			.min(MIN_REPEATED_COMMAND_OCCURRENCES),
		preview: z.string().max(MAX_PREVIEW_CODE_UNITS),
		previewTruncated: z.boolean(),
	})
	.strict();

const transcriptObservationFields = {
	measuredLineCount: z.number().int().nonnegative(),
	prefixLinesExcluded: z.number().int().nonnegative(),
	repeatedBashCommands: z.array(repeatedBashCommandSchema),
	sourceLineCount: z.number().int().nonnegative(),
	toolErrors: z.array(toolErrorSchema),
	toolUseOccurrences: observedToolUseCountsSchema,
};

function locationPrecedes(
	left: Readonly<TranscriptLocation>,
	right: Readonly<TranscriptLocation>,
): boolean {
	return (
		left.line < right.line ||
		(left.line === right.line && left.block < right.block)
	);
}

export {
	transcriptLocationSchema,
	diagnosticIssueKindSchema,
	repeatedBashCommandSchema,
	observedToolUseCountsSchema,
	toolErrorSchema,
	MAX_PREVIEW_CODE_UNITS,
	diagnosticIssueSchema,
	transcriptObservationFields,
	locationPrecedes,
};

export type { TranscriptLocation };
