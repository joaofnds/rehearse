const EVENT_REPLIES: ReadonlyMap<string, unknown> = new Map([
	[
		"/api/attempts/session/case-a/attempt-a/history/4:1",
		{
			applicationTruncated: false,
			deliveredMeasurement: { characters: 14, state: "complete" },
			deliveredText: "command output",
			eventId: "4:1",
			kind: "result",
			locator: { block: 1, line: 4 },
			relatedEventIds: [],
			schemaVersion: 1,
			snapshotMeasurement: {
				reasons: ["not recorded"],
				state: "unavailable",
			},
			state: "recorded",
		},
	],
	[
		"/api/attempts/session/case-a/attempt-a/history/3:1",
		{
			applicationTruncated: false,
			deliveredMeasurement: {
				observedCharacters: 20,
				reasons: ["mixed body"],
				state: "partial",
			},
			deliveredText: "partial recorded body",
			eventId: "3:1",
			kind: "unclassified",
			locator: { block: 1, line: 3 },
			relatedEventIds: [],
			schemaVersion: 1,
			snapshotMeasurement: {
				reasons: ["not recorded"],
				state: "unavailable",
			},
			state: "partial",
		},
	],
	[
		"/api/attempts/session/case-a/attempt-a/history/1:1",
		{
			applicationTruncated: false,
			deliveredMeasurement: {
				reasons: ["not delivered"],
				state: "unavailable",
			},
			eventId: "1:1",
			kind: "call",
			locator: { block: 1, line: 1 },
			relatedEventIds: ["2:1"],
			schemaVersion: 1,
			snapshotMeasurement: {
				reasons: ["not recorded"],
				state: "unavailable",
			},
			state: "invoked",
		},
	],
	[
		"/api/attempts/session/case-a/attempt-a/history/2:1",
		{
			applicationTruncated: false,
			deliveredMeasurement: { characters: 16, state: "complete" },
			deliveredText: "instruction body",
			eventId: "2:1",
			kind: "result",
			locator: { block: 1, line: 2 },
			relatedEventIds: ["1:1"],
			schemaVersion: 1,
			snapshotMeasurement: { characters: 15, state: "complete" },
			sourceSnapshot: "source snapshot",
			state: "delivered",
		},
	],
]);

export { EVENT_REPLIES as default };
