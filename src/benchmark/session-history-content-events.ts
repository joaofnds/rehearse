import { basename } from "node:path";

import type { Immutable } from "./contracts";
import type { TextMeasurement } from "./session-history-contract";
import type {
	CommonEvent,
	HistoryContentBlock,
	MutableEvent,
} from "./session-history-event-contract";
import { measureContent } from "./session-history-measurement";
import { historyTextBlockSchema } from "./session-history-message";
import { skillSource, unclassifiedSource } from "./session-history-sources";
import { skillBodyDirectory } from "./transcript";

/**
 * A block that is neither a tool call nor its result: a skill body answering a
 * Skill call, one a slash command loaded, or content this report does not
 * classify.
 */
function contentBlockEvent(
	common: Immutable<CommonEvent>,
	{ value, row }: HistoryContentBlock,
	retainBodies: boolean,
): MutableEvent {
	const companionId = row?.sourceToolUseID;
	const text = historyTextBlockSchema.safeParse(value);
	const measured = measureContent(text.success ? text.data.text : value);
	const content = retainBodies ? measured.text : undefined;
	const slashSkill =
		companionId === undefined &&
		row?.type === "user" &&
		row.isMeta === true &&
		text.success
			? skillBodyDirectory(text.data.text)
			: undefined;
	if (companionId === undefined) {
		return standaloneContentEvent({
			common,
			content,
			measurement: measured.measurement,
			slashSkill,
		});
	}

	return {
		...common,
		content,
		isDelivery: false,
		kind: "instruction-delivery",
		label: "Skill delivery · partial",
		measurement: measured.measurement,
		source: undefined,
		state: "partial",
		toolUseId: companionId,
	};
}

interface StandaloneContent {
	readonly common: Immutable<CommonEvent>;
	readonly content: string | undefined;
	readonly measurement: TextMeasurement;
	readonly slashSkill: string | undefined;
}

function standaloneContentEvent({
	common,
	content,
	measurement,
	slashSkill,
}: StandaloneContent): MutableEvent {
	const source =
		slashSkill === undefined
			? unclassifiedSource()
			: skillSource(basename(slashSkill));
	return {
		...common,
		content,
		isDelivery: slashSkill !== undefined,
		kind: slashSkill === undefined ? "unclassified" : "instruction-delivery",
		label:
			slashSkill === undefined
				? "Unclassified recorded content"
				: "Skill delivered",
		measurement,
		source,
		sourceId: source.id,
		state: slashSkill === undefined ? "recorded" : "delivered",
	};
}

export { contentBlockEvent as default };
