import { describe, expect, it } from "bun:test";

import type { HomePathCitationMap } from "#benchmark/home-path-citation";
import type { SessionAttemptRequest } from "#benchmark/session-attempt";
import type { SessionConfirmationRepPlan } from "#benchmark/session-confirmation";
import {
	smokeAttempt,
	smokeCase,
} from "#benchmark/session-record-test-fixtures";
import preparedSessionAttempts from "#cli/prepared-session-command";

const FIRST_REP = 1;

const SECOND_REP = 2;

function plan(ordinal: number): SessionConfirmationRepPlan {
	return {
		corpusFiles: [],
		corpusSnapshot: {
			declaredPaths: [],
			kind: "directory",
			origin: { kind: "directory", source: "/corpus" },
			root: "/corpus",
			scope: "whole",
		},
		lineage: "lineage",
		ordinal,
		recordDirectory: `/runs/rep-${ordinal}`,
		repId: `rep-${ordinal}`,
		sessionCase: smokeCase(),
		settings: { budgetUsd: 1, model: "sonnet" },
	};
}

/** A live install whose map differs at each read. */
function citationMaps(
	...homes: readonly string[]
): () => Promise<HomePathCitationMap> {
	const unread = [...homes];

	return async () =>
		await Promise.resolve({ home: unread.shift() ?? "", roots: [] });
}

describe(preparedSessionAttempts.name, () => {
	it("reads the live citation map once for every attempt of a run", async () => {
		const requests: SessionAttemptRequest[] = [];
		const runAttempt = preparedSessionAttempts({
			readCitations: citationMaps("/home/first-read", "/home/second-read"),
			runAttempt: async (request) => {
				requests.push(request);

				return await Promise.resolve(smokeAttempt());
			},
		});

		await runAttempt(plan(FIRST_REP));
		await runAttempt(plan(SECOND_REP));

		expect(requests.map(({ liveCitations }) => liveCitations.home)).toEqual([
			"/home/first-read",
			"/home/first-read",
		]);
	});
});
