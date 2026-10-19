import { afterEach, describe, expect, it } from "bun:test";

import { z } from "zod";

import type { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import type { apiTestApp } from "#server/api-test-workspace";
import { ApiTestWorkspace } from "#server/api-test-workspace";

const PAIRED_SESSION_REP_COUNT = 2;

interface SessionIdentities {
	readonly caseId: string;
	readonly uuid: string;
	readonly secondUuid: string;
	readonly firstRep: string | undefined;
	readonly secondRep: string | undefined;
}

interface ReplayIdentities {
	readonly lineage: string;
	readonly timestamp: string;
	readonly secondReplay: string;
	readonly replayableRun: string;
	readonly stoppedRun: string;
}

interface HistoryFixture {
	readonly app: ReturnType<typeof apiTestApp>;
	readonly session: SessionIdentities;
	readonly replay: ReplayIdentities;
}

const workspace = new ApiTestWorkspace();

afterEach(async () => {
	await workspace.dispose();
});

async function sessionHistories(
	fixture: Readonly<RecordedRunsFixture>,
	corpus: string,
): Promise<SessionIdentities> {
	const { caseId, uuid } = fixture.sessionAttempt;
	const secondUuid = "0f6b6f2a-0000-4000-8000-000000000002";
	await fixture.sessions.writeAttemptAt(secondUuid, {
		caseId,
		corpusRoot: corpus,
		layoutPaths: [],
	});
	const [firstRep, secondRep] =
		await fixture.confirmations.records.writeSessionGroup(
			"group-s",
			PAIRED_SESSION_REP_COUNT,
		);

	return { caseId, firstRep, secondRep, secondUuid, uuid };
}

async function replayHistories(
	fixture: Readonly<RecordedRunsFixture>,
): Promise<ReplayIdentities> {
	await fixture.stopped.writeStoppedRun();
	const { lineage, timestamp } = fixture.stageAttempt;
	const secondReplay = "2026-09-03T02-00-00.000Z";
	await fixture.sessions.writeReplayOf({
		run: fixture.stoppedRun,
		timestamp: secondReplay,
	});

	return {
		lineage,
		replayableRun: fixture.replayableRun,
		secondReplay,
		stoppedRun: fixture.stoppedRun,
		timestamp,
	};
}

async function historyFixture(): Promise<HistoryFixture> {
	const { app, fixture, corpus } = await workspace.serving();
	const session = await sessionHistories(fixture, corpus);
	const replay = await replayHistories(fixture);

	return { app, replay, session };
}

function sessionLinks({
	caseId,
	uuid,
	secondUuid,
	firstRep,
	secondRep,
}: SessionIdentities): ReadonlyMap<string, object> {
	return new Map([
		[`/attempts/session/${caseId}/${uuid}`, { id: uuid, kind: "session" }],
		[
			`/attempts/session/${caseId}/${secondUuid}`,
			{ id: secondUuid, kind: "session" },
		],
		[
			`/groups/group-s/reps/${firstRep}/attempt`,
			{ id: firstRep, kind: "session" },
		],
		[
			`/groups/group-s/reps/${secondRep}/attempt`,
			{ id: secondRep, kind: "session" },
		],
	]);
}

function replayLinks({
	lineage,
	timestamp,
	secondReplay,
	replayableRun,
	stoppedRun,
}: ReplayIdentities): ReadonlyMap<string, object> {
	return new Map<string, object>([
		[`/replays/${lineage}/${timestamp}`, { kind: "stage", run: replayableRun }],
		[`/replays/${lineage}/${secondReplay}`, { kind: "stage", run: stoppedRun }],
		[
			`/runs/${replayableRun}/stages/discuss`,
			{ kind: "stage", run: replayableRun, stage: "discuss" },
		],
		[
			`/runs/${replayableRun}/stages/build`,
			{ kind: "stage", run: replayableRun, stage: "build" },
		],
		[
			`/runs/${stoppedRun}/stages/build`,
			{ kind: "stopped-stage", run: stoppedRun, stage: "build" },
		],
	]);
}

const historyLinkSchema = z.union([
	z.object({ href: z.string(), state: z.literal("available") }).loose(),
	z.object({ state: z.literal("unavailable") }).loose(),
]);

const linkedRowSchema = z
	.object({ links: z.array(historyLinkSchema).default([]) })
	.loose();

const linkedHistorySchema = z.object({
	rows: z.array(linkedRowSchema),
});

const linkedAttemptSchema = z.object({ attempt: z.object({}).loose() }).loose();
const HISTORY_IDENTITIES = {
	confirmations: ["first confirmation rep", "second confirmation rep"],
	replays: ["first replay", "second replay"],
	sessions: ["first session", "second session"],
	stages: [
		"discuss checkpoint",
		"build checkpoint",
		"stopped build checkpoint",
	],
} as const;
const ALL_HISTORY_IDENTITIES = [
	...HISTORY_IDENTITIES.sessions,
	...HISTORY_IDENTITIES.confirmations,
	...HISTORY_IDENTITIES.replays,
	...HISTORY_IDENTITIES.stages,
] as const;

describe("GET /api/runs", () => {
	it(
		"links every record to a history route that opens that record, never a sibling",
		verifyLinksEveryRecordToAHistoryRouteThatOpens,
	);
});

describe("GET /api/attempts/session/:caseId/:uuid/history", () => {
	it.each([...HISTORY_IDENTITIES.sessions])(
		"opens the %s rather than its sibling",
		verifyOpensTheListedIdentity,
	);
});
describe("GET /api/groups/:groupId/reps/:repId/attempt/history", () => {
	it.each([...HISTORY_IDENTITIES.confirmations])(
		"opens the %s rather than its sibling",
		verifyOpensTheListedIdentity,
	);
});
describe("GET /api/replays/:lineage/:timestamp/history", () => {
	it.each([...HISTORY_IDENTITIES.replays])(
		"opens the %s rather than its sibling",
		verifyOpensTheListedIdentity,
	);
});
describe("GET /api/runs/:run/stages/:stage/history", () => {
	it.each([...HISTORY_IDENTITIES.stages])(
		"opens the %s rather than its sibling",
		verifyOpensTheListedIdentity,
	);
});

async function verifyLinksEveryRecordToAHistoryRouteThatOpens(): Promise<void> {
	const { app, session, replay } = await historyFixture();
	const expected = new Map([...sessionLinks(session), ...replayLinks(replay)]);
	const response = await app.runs();
	const listed = linkedHistorySchema.parse(await response.json());
	const hrefs = listed.rows.flatMap((row) =>
		row.links.flatMap((link) =>
			link.state === "available" ? [link.href] : [],
		),
	);

	expect(hrefs.toSorted()).toEqual([...expected.keys()].toSorted());
}

function historyIdentity({
	session,
	replay,
	identity,
}: {
	readonly session: SessionIdentities;
	readonly replay: ReplayIdentities;
	readonly identity: (typeof ALL_HISTORY_IDENTITIES)[number];
}): readonly [string, object] {
	const expected = [...sessionLinks(session), ...replayLinks(replay)];
	const named = new Map(
		ALL_HISTORY_IDENTITIES.map((name, index) => [name, expected[index]]),
	);
	const entry = named.get(identity);
	if (entry === undefined) {
		throw new Error(`No seeded history identity for ${identity}`);
	}

	return entry;
}

async function verifyOpensTheListedIdentity(
	identity: (typeof ALL_HISTORY_IDENTITIES)[number],
): Promise<void> {
	const { app, session, replay } = await historyFixture();
	const [href, attempt] = historyIdentity({ identity, replay, session });

	const response = await app.history(href);
	const body = linkedAttemptSchema.parse(await response.json());
	expect({ href, status: response.status }).toEqual({ href, status: 200 });
	expect(body.attempt).toMatchObject(attempt);
}
