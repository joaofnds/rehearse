import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import type { FakeServer, Reply } from "#client/test-support/fetch-stub";
import type LiveReply from "#client/test-support/live-reply";
import {
	RunRecordBuilder,
	RunRecordStageBuilder,
} from "#client/test-support/run-detail";
import type { RunRecord } from "#server/run-record";

import { OPENED_AT, RUN, serving } from "./corpus-edit-test-fixtures";

const source = { run: RUN, stage: "discuss" } as const;

function sourceRun(): RunRecord {
	return {
		...new RunRecordBuilder({
			finalOutcome: { stage: "discuss", status: "PENDING" },
			run: RUN,
			stages: [
				new RunRecordStageBuilder({
					checkpoint: "recorded",

					checkpointShortId: {
						shortId: "s1",
						state: "available",
					},

					stage: "plan",

					status: "graded",
				}).build(),
				new RunRecordStageBuilder({
					corpusVersion: { digest: OPENED_AT, kind: "version" },

					readManifest: {
						entries: [
							{
								evidence: "observed",
								half: "corpus",
								path: "CLAUDE.md",
								role: "global instructions",
								sha256: "0".repeat(SHA256_HEX_CHARACTERS),
							},
						],
						state: "available",
					},

					stage: "discuss",

					status: "graded",
				}).build(),
			],
		}).build(),
		finalOutcome: { status: "JUDGED", verdict: "PASS" },
	};
}

function servingSource(
	overrides: ReadonlyMap<string, Reply | LiveReply> = new Map(),
): FakeServer {
	return serving(
		new Map([
			[`GET /api/runs/${RUN}`, { body: sourceRun(), status: 200 }],
			...overrides,
		]),
		{ linked: { path: "CLAUDE.md" }, source },
	);
}

const FIRST_RECORDED_STAGE_INDEX = 0;

const SECOND_RECORDED_STAGE_INDEX = 1;

/** Holds the source run's next read open until the test answers it. */
function holdingSourceReads(): PromiseWithResolvers<Response> {
	const answer = globalThis.fetch;
	const pending = Promise.withResolvers<Response>();
	const stub = async (
		request: string | URL | Request,
		init?: RequestInit,
	): Promise<Response> => {
		const { pathname } = new URL(
			request instanceof Request ? request.url : request,
			"http://localhost",
		);

		return await (pathname === `/api/runs/${RUN}`
			? pending.promise
			: answer(request, init));
	};
	stub.preconnect = fetch.preconnect;
	globalThis.fetch = stub;

	return pending;
}

interface SourceReads {
	count: number;
}

/** Counts the source run's reads from here on, answering each as before. */
function countingSourceReads(): SourceReads {
	const answer = globalThis.fetch;
	const reads: SourceReads = { count: 0 };
	const stub = async (
		request: string | URL | Request,
		init?: RequestInit,
	): Promise<Response> => {
		const { pathname } = new URL(
			request instanceof Request ? request.url : request,
			"http://localhost",
		);
		if (pathname === `/api/runs/${RUN}`) {
			reads.count += 1;
		}

		return await answer(request, init);
	};
	stub.preconnect = fetch.preconnect;
	globalThis.fetch = stub;

	return reads;
}

export {
	countingSourceReads,
	holdingSourceReads,
	FIRST_RECORDED_STAGE_INDEX,
	SECOND_RECORDED_STAGE_INDEX,
	servingSource,
	source,
	sourceRun,
};
