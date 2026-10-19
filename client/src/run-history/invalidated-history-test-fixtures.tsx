import { fireEvent, screen } from "@testing-library/react";

import type { CorpusResponse } from "#client/corpus/corpus-query";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { SHELL_BASELINE, renderAppAt } from "#client/test-support/render-app";

import type { RunHistoryResponse } from "./run-history-query";

const DIGEST_PREVIEW_CHARACTERS = 20;

const PREFIX_START_INDEX = 0;

const HELD_REQUEST_COUNT_INCREMENT = 1;

const originalFetch = globalThis.fetch;

const PREVIOUS = "e73e56".padEnd(SHA256_HEX_CHARACTERS, "0");

const CURRENT = "a41c7e".padEnd(SHA256_HEX_CHARACTERS, "0");

const LATER = "c09b11".padEnd(SHA256_HEX_CHARACTERS, "0");

const RUN_A = "2026-09-12T00-00-00.000Z";

const RUN_B = "2026-09-13T00-00-00.000Z";

const RUN_C = "2026-09-14T00-00-00.000Z";

const NAME_A = "r1";

const NAME_B = "r2";

const NAME_C = "r3";

const LIVE_SETTINGS = {
	linkCommand: "rehearse settings --link-corpus <directory>",
	linkedCorpus: { kind: "live", root: "/home/user/.claude" },
	overrun: "The ceiling can be overrun by the calls in flight.",
	recordsDirectory: "/records",
	setCommand: "rehearse settings --spend-ceiling-usd <USD>",
	spendCeilingUsd: 5,
};

/** The edit from PREVIOUS to CURRENT, which invalidated runs A and C. */
const LAST_EDIT = {
	count: 2,
	current: CURRENT,
	kind: "measured",
	previous: PREVIOUS,
	rows: [`run:${RUN_A}`, `run:${RUN_C}`],
} satisfies CorpusResponse["lastEdit"];

/** Runs A and C were invalidated; B and C share a case. */
const BY_CASE: RunHistoryResponse = {
	launches: [],
	rows: [
		new PipelineRunRowBuilder({
			caseId: "brief-reply",
			run: RUN_C,
			shortId: `brief-reply/${NAME_C}`,
			status: "COMPLETE",
		})
			.withExecutionProgress()
			.build(),
		new PipelineRunRowBuilder({
			caseId: "brief-reply",
			run: RUN_B,
			shortId: `brief-reply/${NAME_B}`,
			status: "COMPLETE",
		})
			.withExecutionProgress()
			.build(),
		new PipelineRunRowBuilder({
			caseId: "audit-log",
			run: RUN_A,
			shortId: `audit-log/${NAME_A}`,
			status: "COMPLETE",
		})
			.withExecutionProgress()
			.build(),
	],
	unreadable: [],
};

const NAMED = `/?invalidatedBy=${PREVIOUS}..${CURRENT}`;

const cases: readonly Case[] = [
	...[
		"nonsense",
		"foo..bar",
		"e73e56..a41c7e",
		`${PREVIOUS}..${CURRENT}..${LATER}`,
		`..${CURRENT}`,
	].map((value): Case => [
		`the address names no edit (${value.slice(PREFIX_START_INDEX, DIGEST_PREVIEW_CHARACTERS)})`,
		`/?invalidatedBy=${value}`,
		{},
		"The address names no edit, so no result is listed as invalidated by it.",
	]),
	[
		"the last edit is not recorded",
		NAMED,
		{
			corpus: corpus({
				kind: "not-recorded",
				reason: "the previous version e73e56 cannot be read from the store",
			}),
		},
		"The last edit is not recorded, so no result is listed as invalidated: the previous version e73e56 cannot be read from the store",
	],
	[
		"the corpus report failed",
		NAMED,
		{ failing: "/api/corpus" },
		"Could not load the corpus report, so no result is listed as invalidated.",
	],
	[
		"run history failed",
		NAMED,
		{ failing: "/api/run-listing" },
		"Could not load run history, so no result is listed as invalidated.",
	],
	[
		"the corpus report is loading",
		NAMED,
		{ pending: "/api/corpus" },
		"Reading the last edit…",
	],
	[
		"run history is loading",
		NAMED,
		{ pending: "/api/run-listing" },
		"Reading run history…",
	],
];

type Case = readonly [string, string, ServedReplies | undefined, string];

function searchRuns(text: string): void {
	fireEvent.change(screen.getByRole("searchbox", { name: "Search runs" }), {
		target: { value: text },
	});
}

function history(): RunHistoryResponse {
	return {
		launches: [],
		rows: (
			[
				[RUN_C, NAME_C],
				[RUN_B, NAME_B],
				[RUN_A, NAME_A],
			] as const
		).map(([run, name]) =>
			new PipelineRunRowBuilder({
				run,
				shortId: `audit-log/${name}`,
				status: "COMPLETE",
			})
				.withExecutionProgress()
				.build(),
		),
		unreadable: [],
	};
}

function corpus(lastEdit: CorpusResponse["lastEdit"]): CorpusResponse {
	return {
		digest: CURRENT,
		files: [],
		lastEdit,
		refusals: [],
		root: "/home/user/.claude",
	};
}

interface Served {
	/** Bodies by path; a body set later answers the requests that follow. */
	readonly answers: Map<string, unknown>;
	/** Leaves the requests that follow to `path` unanswered. */
	readonly hold: (path: string) => void;
	/** How many requests were left unanswered. */
	readonly held: () => number;
}

/**
 * Serves the screen's reads, answering `failing` with a 404 and leaving
 * `pending` unanswered, so the screen's loading and failed reads are
 * observed against real requests.
 */
interface ServedReplies {
	readonly corpus?: CorpusResponse;
	readonly runs?: RunHistoryResponse;
	readonly failing?: string;
	readonly pending?: string;
}

function serving(path: string, served: ServedReplies = {}): Served {
	const byPath = new Map<string, unknown>([
		...SHELL_BASELINE,
		["/api/run-listing", served.runs ?? history()],
		["/api/corpus", served.corpus ?? corpus(LAST_EDIT)],
		["/api/settings", LIVE_SETTINGS],
	]);
	if (served.failing !== undefined) {
		byPath.delete(served.failing);
	}
	const held = installHeldResponses(byPath, served.pending);
	renderAppAt(path);
	return { answers: byPath, ...held };
}

function installHeldResponses(
	byPath: ReadonlyMap<string, unknown>,
	pending: string | undefined,
): Pick<Served, "held" | "hold"> {
	const holding = new Set(pending === undefined ? [] : [pending]);
	let held = 0;
	stubFetchByPath(byPath);
	const answer = globalThis.fetch;
	const stub = async (request: string | URL | Request): Promise<Response> => {
		const { pathname } = new URL(
			request instanceof Request ? request.url : request,
			"http://localhost",
		);
		if (!holding.has(pathname)) {
			return await answer(request);
		}
		held += HELD_REQUEST_COUNT_INCREMENT;

		return await Promise.withResolvers<Response>().promise;
	};
	stub.preconnect = fetch.preconnect;
	globalThis.fetch = stub;
	return {
		held: () => held,
		hold: (heldPath) => {
			holding.add(heldPath);
		},
	};
}

async function durableRecords(): Promise<HTMLElement> {
	return await screen.findByRole("table", { name: "Run history" });
}

export {
	BY_CASE,
	CURRENT,
	LAST_EDIT,
	LATER,
	NAME_A,
	NAME_B,
	NAME_C,
	PREVIOUS,
	RUN_A,
	RUN_B,
	cases,
	corpus,
	durableRecords,
	history,
	originalFetch,
	searchRuns,
	serving,
};
