import { z } from "zod";

import type { Immutable } from "./contracts";
import type { TranscriptLine, UserTurn } from "./transcript-line-contract";
import {
	contentBlockSchema,
	providerIdSchema,
	taskNotificationSchema,
	textBlockSchema,
} from "./transcript-message-contract";
import type { UserRecord } from "./transcript-message-contract";

const INTERRUPTION_MARKER = "[Request interrupted by user";

function readUserTurn(
	record: Immutable<UserRecord>,
	blocks: readonly unknown[],
): UserTurn | undefined {
	if (record["isMeta"] === true) {
		return undefined;
	}

	if (record["isCompactSummary"] === true) {
		return "compaction summary";
	}

	if (taskNotificationSchema.safeParse(record).success) {
		return "task notification";
	}

	if (
		blocks.some(
			(block) =>
				contentBlockSchema.safeParse(block).data?.type === "tool_result",
		)
	) {
		return undefined;
	}

	return promptOrInterruption(record, blocks);
}

function readUserFields(
	record: Immutable<UserRecord> | undefined,
	blocks: readonly unknown[],
): Pick<
	TranscriptLine,
	"userTurn" | "startsWithoutParent" | "sourceToolUseId"
> {
	if (record === undefined) {
		return {
			sourceToolUseId: undefined,
			startsWithoutParent: false,
			userTurn: undefined,
		};
	}

	return {
		sourceToolUseId:
			record["isMeta"] === true
				? providerIdSchema.safeParse(record["sourceToolUseID"]).data
				: undefined,
		startsWithoutParent:
			record["parentUuid"] === null || record["parentUuid"] === undefined,
		userTurn: readUserTurn(record, blocks),
	};
}

function promptOrInterruption(
	record: Immutable<UserRecord>,
	blocks: readonly unknown[],
): UserTurn {
	const plain = z.string().safeParse(record.message.content);
	const texts = plain.success
		? [plain.data]
		: blocks
				.map((block) => textBlockSchema.safeParse(block))
				.filter((parsed) => parsed.success)
				.map((parsed) => parsed.data.text);

	return texts.some((text) => text.startsWith(INTERRUPTION_MARKER))
		? "interruption"
		: "prompt";
}

export { readUserFields as default };
