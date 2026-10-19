import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";
import {
	UNREAD_REPLAY_FIGURES,
	UNREAD_STALENESS,
} from "#client/test-support/run-figures";
import type { ReplayRow } from "#server/run-history";

const REPLAY_SOURCE_ROW: ReplayRow = {
	attempt: { count: 2, position: 2 },
	caseId: "case",
	checkpointShortId: "c1",
	corpusVersion: {
		digest: "b".repeat(SHA256_HEX_CHARACTERS),
		kind: "version",
	},
	grade: "B",
	kind: "replay",
	lineage: "lineage",
	links: [],
	recordId: "attempt:stage:lineage/time",
	shortId: "r1",
	stage: "build",
	staleness: UNREAD_STALENESS,
	status: "CONTINUE",
	timestamp: "time",
	...UNREAD_REPLAY_FIGURES,
	cost: {
		missing: [],
		parts: [
			{ part: "build session", usd: 1.5 },
			{ part: "Product Owner", usd: 0.1 },
			{ part: "build judge", usd: 0.4 },
		],
		state: "available",
		usd: 2,
	},
};

const SOURCE_RUN_RECORD = new RunRecordBuilder({
	run: "source",
	stages: [
		new RunRecordStageBuilder({
			corpusVersion: {
				digest: "a".repeat(SHA256_HEX_CHARACTERS),
				kind: "version",
			},

			grade: {
				letter: "C",
				reachesMinimum: false,
				state: "available",
				verdict: "STOP",
			},

			judgeCost: { state: "available", usd: 0.5 },

			sessionCost: { state: "available", usd: 3 },

			stage: "build",
		}).build(),
	],
}).build();

const REPLAY_SOURCE_REPLIES = new Map<string, unknown>([
	["/api/runs/source", SOURCE_RUN_RECORD],
	[
		"/api/runs/source/stages/build/output",
		{
			kind: "artifact",
			path: "delivery.md",
			state: "available",
			text: "Original delivery omitted hasMore.",
		},
	],
	[
		"/api/attempt-evidence/attempt%3Astage%3Alineage%2Ftime",
		{
			assessment: {
				detailed: false,
				dimensions: [],
				grade: "B",
				hardBlockers: [],
				requirements: [],
				verdict: "CONTINUE",
			},
			kind: "stage",
			output: {
				kind: "artifact",
				path: "delivery.md",
				state: "available",
				text: "Replay delivery includes hasMore.",
			},
			stage: "build",
			state: "available",
		},
	],
]);

export { REPLAY_SOURCE_REPLIES, REPLAY_SOURCE_ROW, SOURCE_RUN_RECORD };
