import { z } from "zod";

import type { Immutable } from "./contracts";
import { jsonValueSchema } from "./json-value";
import type { JsonValue } from "./json-value";
import type { TextMeasurement } from "./session-history-contract";
import type { MutableEvent } from "./session-history-event-contract";
import { historyTextBlockSchema } from "./session-history-message";

const EMPTY_COLLECTION_LENGTH = 0;

const UNICODE_CODE_POINT_COUNT_INCREMENT = 1;

const NO_OBSERVED_CHARACTERS = 0;

const EMPTY_CHARACTER_TOTAL = 0;

class TextBodyMeasurement {
	private readonly texts: string[] = [];
	private unsupported = false;
	public observe(entry: JsonValue): void {
		const text = historyTextBlockSchema.safeParse(entry);
		if (text.success) {
			this.texts.push(text.data.text);
		} else {
			this.unsupported = true;
		}
	}
	public reading(): MeasuredContent {
		const joined = this.texts.join("");
		if (this.texts.length === EMPTY_COLLECTION_LENGTH) {
			return {
				measurement: {
					reasons: ["unsupported text body"],
					state: "unavailable",
				},
				text: undefined,
			};
		}
		if (this.unsupported) {
			return {
				measurement: {
					observedCharacters: countCharacters(joined),
					reasons: ["mixed supported and unsupported body blocks"],
					state: "partial",
				},
				text: joined,
			};
		}

		return {
			measurement: { characters: countCharacters(joined), state: "complete" },
			text: joined,
		};
	}
}

function countCharacters(text: string): number {
	// Unicode code points are the shaped measurement unit; grapheme clusters and
	// UTF-16 code units would both answer a different question.
	const points = text[Symbol.iterator]();
	let count = 0;
	while (points.next().done !== true) {
		count += UNICODE_CODE_POINT_COUNT_INCREMENT;
	}

	return count;
}

interface MeasuredContent {
	readonly text: string | undefined;
	readonly measurement: TextMeasurement;
}

function measureContent(value: JsonValue | undefined): MeasuredContent {
	const string = z.string().safeParse(value);
	if (string.success) {
		return {
			measurement: {
				characters: countCharacters(string.data),
				state: "complete",
			},
			text: string.data,
		};
	}
	const list = z.array(jsonValueSchema).safeParse(value);
	if (!list.success) {
		return {
			measurement: { reasons: ["unsupported text body"], state: "unavailable" },
			text: undefined,
		};
	}

	const measurement = new TextBodyMeasurement();
	for (const entry of list.data) {
		measurement.observe(entry);
	}
	return measurement.reading();
}

function observedCharacters(measurement: Readonly<TextMeasurement>): number {
	if (measurement.state === "complete") {
		return measurement.characters;
	}
	if (measurement.state === "partial") {
		return measurement.observedCharacters;
	}

	return NO_OBSERVED_CHARACTERS;
}

function sourceMeasurement(
	events: Immutable<readonly MutableEvent[]>,
): TextMeasurement {
	const measured = events.filter(({ kind }) => kind !== "call");
	const observed = measured.reduce(
		(total, { measurement }) => total + observedCharacters(measurement),
		EMPTY_CHARACTER_TOTAL,
	);
	const partial = measured.filter(
		({ measurement }) => measurement.state === "partial",
	);
	const unavailable = measured.filter(
		({ measurement }) => measurement.state === "unavailable",
	);
	if (
		partial.length > EMPTY_COLLECTION_LENGTH ||
		unavailable.length > EMPTY_COLLECTION_LENGTH
	) {
		const reasons = new Set([
			...partial.flatMap(({ measurement }) =>
				measurement.state === "partial" ? measurement.reasons : [],
			),
			...unavailable.flatMap(({ measurement }) =>
				measurement.state === "unavailable" ? measurement.reasons : [],
			),
		]);
		return {
			observedCharacters: observed,
			reasons: [...reasons],
			state: "partial",
		};
	}
	if (measured.length === EMPTY_COLLECTION_LENGTH) {
		return { reasons: ["no recorded result"], state: "unavailable" };
	}

	return { characters: observed, state: "complete" };
}

export { observedCharacters, measureContent, sourceMeasurement };
