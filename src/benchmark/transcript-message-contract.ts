import { z } from "zod";

/**
 * The session file's format is the provider's, not ours, so a record type this
 * harness does not recognize reads as a record with no tool calls rather than
 * as a failure. A strict schema here would turn a new provider record type into
 * a failed attempt, which is a false negative on the thing being measured.
 */
const toolUseSchema = z.looseObject({
	id: z.string().nonempty().optional(),
	input: z.looseObject({
		command: z.string().optional(),
		file_path: z.string().optional(),
	}),
	name: z.string().nonempty(),
	type: z.literal("tool_use"),
});

/**
 * The provider's copy of the messages it sent in one request. Its turns are
 * already recorded as user and assistant rows, so reading its message again
 * would count every turn twice.
 */
const REQUEST_BLOB_RECORD_TYPE = "api-request-blob";

const transcriptRecordSchema = z.looseObject({
	message: z
		.looseObject({
			content: z.unknown().optional(),
		})
		.optional(),
	type: z.string().optional(),
});

const assistantMessageSchema = z.looseObject({
	content: z.array(z.unknown()),
});

const assistantRecordSchema = z.looseObject({
	message: assistantMessageSchema,
	type: z.literal("assistant"),
});

/**
 * Read apart from the record schemas, so a drifted id loses only itself and
 * never the row's tool calls.
 */
const providerIdSchema = z.string().nonempty();

const userMessageContentSchema = z.union([z.string(), z.array(z.unknown())]);

const userMessageSchema = z.looseObject({
	content: userMessageContentSchema,
});

const userRecordSchema = z.looseObject({
	message: userMessageSchema,
	type: z.literal("user"),
});

type UserRecord = z.infer<typeof userRecordSchema>;

/**
 * An Agent call's result, and a Skill call's that forked into its own context,
 * name the sub-agent the provider ran on the record's `toolUseResult`.
 */
const namedAgentRecordSchema = z.looseObject({
	toolUseResult: z.looseObject({ agentId: z.string().nonempty() }),
	type: z.literal("user"),
});

const toolResultSchema = z.looseObject({
	is_error: z.boolean().optional(),
	tool_use_id: z.string().nonempty().optional(),
	type: z.literal("tool_result"),
});

const contentBlockSchema = z.looseObject({ type: z.string().nonempty() });

const outputStyleAttachmentSchema = z.looseObject({
	style: z.string().nonempty(),
	type: z.literal("output_style"),
});

const attachmentRecordSchema = z.looseObject({
	attachment: z.unknown(),
	type: z.literal("attachment"),
});

const metaRecordSchema = z.looseObject({ isMeta: z.literal(true) });

const textBlockSchema = z.looseObject({
	text: z.string(),
	type: z.literal("text"),
});

/** The provider's mark on a row reporting that a background agent finished. */
const taskNotificationSchema = z.looseObject({
	origin: z.looseObject({ kind: z.literal("task-notification") }),
});

type ToolUse = z.infer<typeof toolUseSchema>;

export {
	REQUEST_BLOB_RECORD_TYPE,
	namedAgentRecordSchema,
	attachmentRecordSchema,
	outputStyleAttachmentSchema,
	textBlockSchema,
	taskNotificationSchema,
	contentBlockSchema,
	providerIdSchema,
	transcriptRecordSchema,
	assistantRecordSchema,
	userRecordSchema,
	toolUseSchema,
	toolResultSchema,
	metaRecordSchema,
};

export type { ToolUse, UserRecord };
