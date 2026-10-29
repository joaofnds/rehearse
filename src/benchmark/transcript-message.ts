import { unhandled } from "./contracts";
import type { JsonValue } from "./json-value";
import {
	assistantRecordSchema,
	providerIdSchema,
	transcriptRecordRole,
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

	const role = transcriptRecordRole(record.data);
	switch (role) {
		case "turn": {
			return record.data.type === "assistant"
				? assistantMessage(parsed)
				: userMessage(parsed);
		}
		case "unplaced-message": {
			return undefined;
		}
		case "metadata":
		case "untyped": {
			return {
				blocks: [],
				requestId: undefined,
				type: record.data.type,
				user: undefined,
			};
		}
		default: {
			return unhandled(role, "transcript record role");
		}
	}
}

export { readMessage as default };
