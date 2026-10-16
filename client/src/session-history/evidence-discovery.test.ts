import { describe, expect, it } from "bun:test";
import type { SessionHistoryEvent } from "#benchmark/session-history";
import {
	filterEvidenceEvents,
	preferredEvidenceEvent,
} from "./evidence-discovery";

const raw: SessionHistoryEvent = {
	id: "1:1",
	locator: { line: 1, block: 1 },
	region: "attempt",
	kind: "unclassified",
	state: "recorded",
	label: "Unclassified recorded content",
	measurement: { state: "unavailable", reasons: ["unsupported"] },
	relatedEventIds: [],
};
const delivered: SessionHistoryEvent = {
	...raw,
	id: "4:1",
	locator: { line: 4, block: 1 },
	kind: "instruction-delivery",
	state: "delivered",
	label: "Skill delivered",
	sourceId: "skill:build",
	measurement: { state: "complete", characters: 120 },
};

describe("evidence discovery", () => {
	it("prefers a measured delivery over earlier raw content and measured activity", () => {
		const measured: SessionHistoryEvent = {
			...raw,
			id: "2:1",
			kind: "result",
			measurement: { state: "complete", characters: 20 },
		};

		expect(
			preferredEvidenceEvent([raw, measured, delivered], undefined)?.id,
		).toBe("4:1");
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
				state: "failed",
				label: "Tool failed",
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
