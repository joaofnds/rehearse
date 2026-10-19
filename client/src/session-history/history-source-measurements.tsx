import type {
	SessionHistorySource,
	TextMeasurement,
} from "#benchmark/session-history";

import type { SourceSort } from "./history-investigation-contract";

const UNOBSERVED_CHARACTER_SORT_VALUE = -1;

const EQUAL_SORT_POSITION = 0;

const UNOBSERVED_DELIVERY_SORT_VALUE = -1;

function measurementLabel(measurement: TextMeasurement): string {
	if (measurement.state === "complete") {
		return `✓ Complete · ${measurement.characters} recorded text characters — not tokens`;
	}
	if (measurement.state === "partial") {
		return `◐ Partial · ${measurement.observedCharacters} observed recorded text characters — not tokens · ${measurement.reasons.join(", ")}`;
	}

	return `? Unavailable · ${measurement.reasons.join(", ")}`;
}

function sortableCharacters(measurement: TextMeasurement): number {
	if (measurement.state === "complete") {
		return measurement.characters;
	}
	if (measurement.state === "partial") {
		return measurement.observedCharacters;
	}

	return UNOBSERVED_CHARACTER_SORT_VALUE;
}

function sortedSources(
	sources: readonly SessionHistorySource[],
	sort: SourceSort,
): readonly SessionHistorySource[] {
	return sources.toSorted((left, right) => {
		const size =
			sort === "Most repeated"
				? (right.observedDeliveryCount ?? UNOBSERVED_DELIVERY_SORT_VALUE) -
					(left.observedDeliveryCount ?? UNOBSERVED_DELIVERY_SORT_VALUE)
				: compareSourceMeasurement(left.measurement, right.measurement);
		return size === EQUAL_SORT_POSITION
			? compareSourceLocation(left, right)
			: size;
	});
}

function sourceSizeLabel(measurement: TextMeasurement): string {
	if (measurement.state === "complete") {
		return `${measurement.characters.toLocaleString("en-US")} chars`;
	}
	if (measurement.state === "partial") {
		return `≥ ${measurement.observedCharacters.toLocaleString("en-US")} chars · partial`;
	}
	return "Size unavailable";
}

function compareSourceMeasurement(
	left: TextMeasurement,
	right: TextMeasurement,
): number {
	const leftCharacters = sortableCharacters(left);
	const rightCharacters = sortableCharacters(right);
	if (rightCharacters !== leftCharacters) {
		return rightCharacters - leftCharacters;
	}
	const rank = { complete: 2, partial: 1, unavailable: 0 } as const;
	return rank[right.state] - rank[left.state];
}

function compareSourceLocation(
	left: SessionHistorySource,
	right: SessionHistorySource,
): number {
	const line = left.firstLocator.line - right.firstLocator.line;
	if (line !== EQUAL_SORT_POSITION) {
		return line;
	}
	const block = left.firstLocator.block - right.firstLocator.block;
	return block === EQUAL_SORT_POSITION
		? left.name.localeCompare(right.name)
		: block;
}

export { measurementLabel, sortedSources, sourceSizeLabel };
