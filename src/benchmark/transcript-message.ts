import type { JsonValue } from "./json-value";
import {
	REQUEST_BLOB_RECORD_TYPE,
	assistantRecordSchema,
	providerIdSchema,
	transcriptRecordSchema,
	userRecordSchema,
} from "./transcript-message-contract";
import type { UserRecord } from "./transcript-message-contract";

interface ParsedTranscriptMessage {
	readonly type: string | undefined;
	readonly blocks: readonly unknown[];
	readonly user: UserRecord | undefined;
	readonly requestId: string | undefined;
}

function assistantMessage(
	parsed: JsonValue,
): ParsedTranscriptMessage | undefined {
	const assistant = assistantRecordSchema.safeParse(parsed);
	if (!assistant.success) {
		return undefined;
	}
	return {
		blocks: assistant.data.message.content,
		requestId: providerIdSchema.safeParse(assistant.data["requestId"]).data,
		type: "assistant",
		user: undefined,
	};
}

function userMessage(parsed: JsonValue): ParsedTranscriptMessage | undefined {
	const userRecord = userRecordSchema.safeParse(parsed);
	if (!userRecord.success) {
		return undefined;
	}
	const user = userRecord.data;
	return {
		blocks: Array.isArray(user.message.content) ? user.message.content : [],
		requestId: undefined,
		type: "user",
		user,
	};
}

function readMessage(parsed: JsonValue): ParsedTranscriptMessage | undefined {
	const record = transcriptRecordSchema.safeParse(parsed);
	if (!record.success) {
		return undefined;
	}
	if (record.data.type === "assistant") {
		return assistantMessage(parsed);
	}
	if (record.data.type === "user") {
		return userMessage(parsed);
	}
	if (
		record.data.message !== undefined &&
		record.data.type !== REQUEST_BLOB_RECORD_TYPE
	) {
		return undefined;
	}
	return {
		blocks: [],
		requestId: undefined,
		type: record.data.type,
		user: undefined,
	};
}

export { readMessage as default };
