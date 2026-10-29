import type { z } from "zod";

import type { Immutable } from "./contracts";
import type { TextMeasurement } from "./session-history-contract";
import type {
	CommonEvent,
	MutableEvent,
} from "./session-history-event-contract";
import { measureContent } from "./session-history-measurement";
import type { historyThinkingBlockSchema } from "./session-history-message";
import { unclassifiedSource } from "./session-history-sources";

type ThinkingBlock = z.infer<typeof historyThinkingBlockSchema>;

interface RecordedEvent {
	readonly common: Immutable<CommonEvent>;
	readonly label: string;
	readonly measurement: TextMeasurement;
	readonly content?: string | undefined;
}

function recordedEvent({
	common,
	label,
	measurement,
	content,
}: RecordedEvent): MutableEvent {
	const source = unclassifiedSource();

	return {
		...common,
		content,
		isDelivery: false,
		kind: "unclassified",
		label,
		measurement,
		source,
		sourceId: source.id,
		state: "recorded",
	};
}

function attachmentEvent(
	common: Immutable<CommonEvent>,
	attachmentKind: string,
): MutableEvent {
	return recordedEvent({
		common,
		label: `Attachment · ${attachmentKind}`,
		measurement: {
			reasons: [
				"the provider renders the attachment and the transcript does not record the delivered text",
			],
			state: "unavailable",
		},
	});
}

function unrecordedThinking(
	common: Immutable<CommonEvent>,
	label: string,
): MutableEvent {
	return recordedEvent({
		common,
		label,
		measurement: {
			reasons: ["the provider did not record the thinking text"],
			state: "unavailable",
		},
	});
}

function thinkingEvent(
	common: Immutable<CommonEvent>,
	block: Immutable<ThinkingBlock>,
	retainBodies: boolean,
): MutableEvent {
	if (block.type === "redacted_thinking") {
		return unrecordedThinking(common, "Redacted thinking");
	}
	if (block.thinking === undefined || block.thinking === "") {
		return unrecordedThinking(common, "Thinking");
	}

	const measured = measureContent(block.thinking);

	return recordedEvent({
		common,
		content: retainBodies ? measured.text : undefined,
		label: "Thinking",
		measurement: measured.measurement,
	});
}

export { attachmentEvent, thinkingEvent };
