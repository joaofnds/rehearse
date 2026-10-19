import { describe, expect, it } from "bun:test";

import type { SessionHistoryEvent } from "#benchmark/session-history";

import {
	filterEvidenceEvents,
	preferredEvidenceEvent,
} from "./evidence-discovery";

const raw: SessionHistoryEvent = {
	id: "1:1",
	kind: "unclassified",
	label: "Unclassified recorded content",
	locator: { block: 1, line: 1 },
	measurement: { reasons: ["unsupported"], state: "unavailable" },
	region: "attempt",
	relatedEventIds: [],
	state: "recorded",
};
const delivered: SessionHistoryEvent = {
	...raw,
	id: "4:1",
	kind: "instruction-delivery",
	label: "Skill delivered",
	locator: { block: 1, line: 4 },
	measurement: { characters: 120, state: "complete" },
	sourceId: "skill:build",
	state: "delivered",
};

describe("evidence discovery", () => {
	it("prefers a measured delivery over earlier raw content and measured activity", () => {
		const measured: SessionHistoryEvent = {
			...raw,
			id: "2:1",
			kind: "result",
			measurement: { characters: 20, state: "complete" },
		};

		expect(preferredEvidenceEvent([raw, measured, delivered])?.id).toBe("4:1");
	});

	it("keeps an explicit raw-record selection", () => {
		expect(preferredEvidenceEvent([raw, delivered], "1:1")?.id).toBe("1:1");
	});

	it.each([
		["Activity", ["4:1", "5:1"]],
		["Deliveries", ["4:1"]],
		["Errors", ["5:1"]],
		["All records", ["1:1", "4:1", "5:1"]],
	] as const)(
		"shows only %s evidence with an empty search",
		(filter, expected) => {
			const failed: SessionHistoryEvent = {
				...raw,
				id: "5:1",
				kind: "result",
				label: "Tool failed",
				state: "failed",
			};

			expect(
				filterEvidenceEvents([raw, delivered, failed], "", filter).map(
					({ id }) => id,
				),
			).toEqual([...expected]);
		},
	);

	it("searches the source identity while preserving raw records in the full view", () => {
		expect(
			filterEvidenceEvents([raw, delivered], "build", "Deliveries"),
		).toEqual([delivered]);
		expect(filterEvidenceEvents([raw, delivered], "", "All records")).toEqual([
			raw,
			delivered,
		]);
	});
});
