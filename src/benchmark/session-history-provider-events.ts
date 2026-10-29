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

function thinkingEvent(
	common: Immutable<CommonEvent>,
	block: Immutable<ThinkingBlock>,
	retainBodies: boolean,
): MutableEvent {
	const label = block.type === "thinking" ? "Thinking" : "Redacted thinking";
	const text = block.type === "thinking" ? block.thinking : undefined;
	if (text === undefined || text === "") {
		return recordedEvent({
			common,
			label,
			measurement: {
				reasons: ["the provider did not record the thinking text"],
				state: "unavailable",
			},
		});
	}
	const measured = measureContent(text);

	return recordedEvent({
		common,
		content: retainBodies ? measured.text : undefined,
		label,
		measurement: measured.measurement,
	});
}

export { attachmentEvent, thinkingEvent };
