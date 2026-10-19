import { afterEach, describe, expect, it } from "bun:test";

import { z } from "zod";

import { PASS } from "#benchmark/comparison-test-fixtures";
import {
	clearFigureRoots,
	emptyFixture,
	onlyRowOfKind,
} from "#server/history-figures-workspace-test-fixture";

import { UNRECORDED_REP_REASON } from "./confirmation-group-summary";

afterEach(clearFigureRoots);

const SINGLE_SESSION_REP_COUNT = 1;

const SESSION_REP_COST_USD = 0.25;

/** A rep record, read loosely so a test can mark its metrics incomplete. */
const repRecordSchema = z.looseObject({ metrics: z.looseObject({}) });

describe("/api/runs", () => {
	describe("GET", () => {
		describe("a confirmation group row", () => {
			it(
				"carries its makespan as its wall time",
				verifyCarriesItsMakespanAsItsWallTime,
			);

			it(
				"sums what its reps spent and names each rep that recorded nothing",
				verifySumsWhatItsRepsSpentAndNamesEachRep,
			);

			it(
				"sums the calls a rep with incomplete metrics recorded and names what it lacks",
				verifySumsTheCallsARepWithIncompleteMetricsRecorded,
			);

			it(
				"adds a session group's recorded preflight spend to its reps'",
				verifyAddsASessionGroupSRecordedPreflightSpendTo,
			);

			it(
				"carries its cost as not recorded, naming each part, when no rep or preflight recorded its spend",
				verifyCarriesItsCostAsNotRecordedNamingEachPart,
			);
		});
	});
});

async function verifyCarriesItsMakespanAsItsWallTime(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.write();

	const row = await onlyRowOfKind(fixture, "group");

	expect(row).toMatchObject({
		wallTime: { ms: 200, state: "available" },
	});
}

async function verifySumsWhatItsRepsSpentAndNamesEachRep(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writePipelineGroup("pipeline-group", [
		PASS,
		PASS,
		undefined,
	]);

	const row = await onlyRowOfKind(fixture, "group");

	expect(row).toMatchObject({
		cost: {
			missing: [
				{ part: "pipeline-group-rep-3", reason: UNRECORDED_REP_REASON },
			],
			parts: [
				{ part: "pipeline-group-rep-1", usd: 1 },
				{ part: "pipeline-group-rep-2", usd: 2 },
			],
			state: "available",
			usd: 3,
		},
	});
}

async function verifySumsTheCallsARepWithIncompleteMetricsRecorded(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writePipelineGroup("pipeline-group", [
		PASS,
		undefined,
	]);
	const file = Bun.file(
		fixture.confirmations.records.repRecordFile({
			groupId: "pipeline-group",
			repId: "pipeline-group-rep-1",
		}),
	);
	const rep = repRecordSchema.parse(await file.json());
	await Bun.write(
		file,
		JSON.stringify({
			...rep,
			metrics: {
				...rep.metrics,
				missing: ["final judge"],
				status: "MISSING",
			},
			outcome: "UNSUCCESSFUL",
		}),
	);

	const row = await onlyRowOfKind(fixture, "group");

	expect(row).toMatchObject({
		cost: {
			missing: [
				{ part: "pipeline-group-rep-1", reason: "final judge" },
				{ part: "pipeline-group-rep-2", reason: UNRECORDED_REP_REASON },
			],
			parts: [{ part: "pipeline-group-rep-1", usd: 1 }],
			state: "available",
			usd: 1,
		},
	});
}

async function verifyAddsASessionGroupSRecordedPreflightSpendTo(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writeSessionGroup(
		"session-group",
		SINGLE_SESSION_REP_COUNT,
		SESSION_REP_COST_USD,
	);

	const row = await onlyRowOfKind(fixture, "group");

	expect(row).toMatchObject({
		cost: {
			missing: [
				{ part: "session-group-rep-1", reason: "metrics" },
				{ part: "session-group-rep-2", reason: UNRECORDED_REP_REASON },
			],
			parts: [{ part: "preflight", usd: 0.25 }],
			state: "available",
			usd: 0.25,
		},
	});
}

async function verifyCarriesItsCostAsNotRecordedNamingEachPart(): Promise<void> {
	const fixture = await emptyFixture();
	await fixture.confirmations.records.writeSessionGroup(
		"session-group",
		SINGLE_SESSION_REP_COUNT,
	);

	const row = await onlyRowOfKind(fixture, "group");

	expect(row).toMatchObject({
		cost: {
			reasons: [
				"preflight: metrics unavailable",
				"session-group-rep-1: metrics",
				`session-group-rep-2: ${UNRECORDED_REP_REASON}`,
			],
			state: "unavailable",
		},
	});
}
