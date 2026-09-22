import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type { SSEStreamingApi } from "hono/streaming";
import type { CorpusRoot } from "#benchmark/corpus-file";
import { displayPath } from "#benchmark/config";
import { parseComparisonReport } from "#benchmark/comparison-record";
import { recordFileFor } from "#cli/show-command";
import { UsageError } from "#cli/commands";
import { RefusedPreconditionError } from "#benchmark/exit-codes";
import { parseRecordId } from "#cli/record-id";
import { runEventsDatabaseFile } from "#benchmark/run-layout";
import type { RunEventStore } from "#benchmark/run-events";
import {
	isTerminalRunEventKind,
	openRunEventStore,
} from "#benchmark/run-events";
import { comparisonReport } from "./comparisons";
import { comparisonAttemptHistoryLinks } from "./comparison-history-links";
import { corpusReport } from "./corpus-report";
import { redactAbsolutePaths, redactedFilePath } from "./redact-path";
import type { RunLiveness } from "#benchmark/run-liveness";
import { runHistoryReport } from "./run-history";
import {
	readConfirmationAttemptHistory,
	readConfirmationAttemptHistoryDetail,
	readConfirmationAttemptRequestSeries,
	readReplayHistory,
	readSessionAttemptHistory,
	readSessionAttemptHistoryDetail,
	readSessionAttemptRequestSeries,
	readStageCorpusReconciliation,
	readStageHistory,
	readStageHistoryDetail,
	SessionHistoryReaderError,
} from "./session-history-reader";
import type { SessionHistoryAttemptSeries } from "./session-history-reader";
import { committedRateCatalog } from "#benchmark/rate-catalog";

const RUN_EVENTS_POLL_MS = 500;

interface HistoryErrorView {
	readonly kind: "not-found" | "refused";
	readonly message: string;
}

interface HistoryErrorResponse {
	readonly message: string;
	readonly status: 400 | 404;
}

function historyError(error: HistoryErrorView): HistoryErrorResponse {
	return {
		message: redactAbsolutePaths(error.message),
		status: error.kind === "not-found" ? 404 : 400,
	};
}

/**
 * The instructions attachment records each loaded file by its absolute path on
 * the machine that ran the attempt, so serving it verbatim would put the
 * operator's home directory into a browser. `redactedFilePath` drops the
 * directories above the file and keeps the file's own name, because a load is
 * named by its path and its memory type and a list of identical placeholders
 * names no file.
 */
function redactedSeries(
	read: Readonly<SessionHistoryAttemptSeries>,
): SessionHistoryAttemptSeries {
	const { instructionLoads } = read;
	if (instructionLoads.state === "unavailable") {
		return read;
	}

	return {
		...read,
		instructionLoads: {
			state: "available",
			loads: instructionLoads.loads.map((load) => ({
				filePath: redactedFilePath(load.filePath),
				memoryType: load.memoryType,
				loadReason: load.loadReason,
				triggerFilePath: load.triggerFilePath,
				parentFilePath: load.parentFilePath,
			})),
		},
	};
}

async function streamRunEvents(
	store: RunEventStore,
	runId: string,
	stream: Readonly<SSEStreamingApi>,
): Promise<void> {
	let sequence = 0;
	let sawTerminalEvent = false;

	while (!sawTerminalEvent && !stream.aborted) {
		for (const event of store.eventsSince(runId, sequence)) {
			const { kind, sequence: eventSequence } = event;
			await stream.writeSSE({ data: JSON.stringify(event) });
			sequence = eventSequence;
			if (isTerminalRunEventKind(kind)) {
				sawTerminalEvent = true;
			}
		}
		if (!sawTerminalEvent && !stream.aborted) {
			await stream.sleep(RUN_EVENTS_POLL_MS);
		}
	}
}

export interface ApiDependencies {
	readonly runsDirectory: string;
	readonly corpusSource: CorpusRoot;
	readonly liveness: RunLiveness;
}

/**
 * Chained (`.get().get()`) rather than two separate `app.get()` statements,
 * because Hono's RPC type inference builds `AppType` off the chain: a caller
 * using `hc<AppType>()` gets `/api/runs`'s response type from this
 * declaration itself, so the client never redeclares the row shape by hand
 * (decision-3's stated reason for choosing Hono over an alternative with no
 * RPC client). `createApiApp` builds and returns this chain directly, rather
 * than through a helper taking a mutable `Hono` parameter, since the RPC
 * type only survives an unbroken method chain from `new Hono()`. That chain
 * is exactly the return type `ApiRoutes` below names, so an explicit
 * annotation here would have to be `ApiRoutes` itself, which is circular:
 * no other spelling of this type exists to write by hand.
 */
// oxlint-disable-next-line typescript/explicit-function-return-type, typescript/explicit-module-boundary-types
export const createApiApp = (dependencies: ApiDependencies) => {
	const app = new Hono()
		.get("/api/runs", async (context) => {
			const report = await runHistoryReport(
				dependencies.runsDirectory,
				dependencies.corpusSource,
				dependencies.liveness,
			);

			return context.json(report);
		})
		.get("/api/corpus", async (context) => {
			const report = await corpusReport(
				dependencies.corpusSource,
				dependencies.runsDirectory,
			);

			return context.json(report);
		})
		.get("/api/comparisons/:digest", async (context) => {
			try {
				const id = parseRecordId(`comparison:${context.req.param("digest")}`);
				const file = await recordFileFor(id, dependencies.runsDirectory);
				if (!(await Bun.file(file).exists())) {
					throw new RefusedPreconditionError(
						`No record comparison:${context.req.param("digest")} at ${displayPath(file)}`,
					);
				}

				const report = parseComparisonReport(await Bun.file(file).text());

				return context.json(
					comparisonReport(
						report,
						await comparisonAttemptHistoryLinks(
							report,
							dependencies.runsDirectory,
						),
					),
				);
			} catch (error) {
				if (error instanceof UsageError) {
					return context.json(
						{ error: redactAbsolutePaths(error.message) },
						400,
					);
				}
				if (error instanceof RefusedPreconditionError) {
					return context.json(
						{ error: redactAbsolutePaths(error.message) },
						404,
					);
				}

				throw error;
			}
		})
		.get(
			"/api/attempts/session/:caseId/:uuid/history/requests",
			async (context) => {
				try {
					return context.json(
						redactedSeries(
							await readSessionAttemptRequestSeries(
								{
									runsDirectory: dependencies.runsDirectory,
									caseId: context.req.param("caseId"),
									uuid: context.req.param("uuid"),
								},
								committedRateCatalog,
							),
						),
					);
				} catch (error) {
					if (!(error instanceof SessionHistoryReaderError)) {
						throw error;
					}
					const response = historyError(error);

					return context.json({ error: response.message }, response.status);
				}
			},
		)
		.get(
			"/api/groups/:groupId/reps/:repId/attempt/history/requests",
			async (context) => {
				try {
					return context.json(
						redactedSeries(
							await readConfirmationAttemptRequestSeries(
								{
									runsDirectory: dependencies.runsDirectory,
									groupId: context.req.param("groupId"),
									repId: context.req.param("repId"),
								},
								committedRateCatalog,
							),
						),
					);
				} catch (error) {
					if (!(error instanceof SessionHistoryReaderError)) {
						throw error;
					}
					const response = historyError(error);

					return context.json({ error: response.message }, response.status);
				}
			},
		)
		.get(
			"/api/attempts/session/:caseId/:uuid/history/:eventId",
			async (context) => {
				try {
					const detail = await readSessionAttemptHistoryDetail(
						{
							runsDirectory: dependencies.runsDirectory,
							caseId: context.req.param("caseId"),
							uuid: context.req.param("uuid"),
						},
						context.req.param("eventId"),
					);
					if (detail === undefined) {
						return context.json({ error: "No event at this locator" }, 404);
					}

					return context.json(detail);
				} catch (error) {
					if (!(error instanceof SessionHistoryReaderError)) {
						throw error;
					}
					const response = historyError(error);

					return context.json({ error: response.message }, response.status);
				}
			},
		)
		.get("/api/replays/:lineage/:timestamp/history", async (context) => {
			try {
				return context.json(
					await readReplayHistory({
						runsDirectory: dependencies.runsDirectory,
						lineage: context.req.param("lineage"),
						timestamp: context.req.param("timestamp"),
					}),
				);
			} catch (error) {
				if (!(error instanceof SessionHistoryReaderError)) {
					throw error;
				}
				const response = historyError(error);

				return context.json({ error: response.message }, response.status);
			}
		})
		.get("/api/runs/:run/stages/:stage/history/corpus", async (context) => {
			try {
				return context.json(
					await readStageCorpusReconciliation({
						runsDirectory: dependencies.runsDirectory,
						run: context.req.param("run"),
						stage: context.req.param("stage"),
					}),
				);
			} catch (error) {
				if (!(error instanceof SessionHistoryReaderError)) {
					throw error;
				}
				const response = historyError(error);

				return context.json({ error: response.message }, response.status);
			}
		})
		.get("/api/runs/:run/stages/:stage/history/:eventId", async (context) => {
			try {
				const detail = await readStageHistoryDetail(
					{
						runsDirectory: dependencies.runsDirectory,
						run: context.req.param("run"),
						stage: context.req.param("stage"),
					},
					context.req.param("eventId"),
				);
				if (detail === undefined) {
					return context.json({ error: "No event at this locator" }, 404);
				}

				return context.json(detail);
			} catch (error) {
				if (!(error instanceof SessionHistoryReaderError)) {
					throw error;
				}
				const response = historyError(error);

				return context.json({ error: response.message }, response.status);
			}
		})
		.get("/api/runs/:run/stages/:stage/history", async (context) => {
			try {
				return context.json(
					await readStageHistory({
						runsDirectory: dependencies.runsDirectory,
						run: context.req.param("run"),
						stage: context.req.param("stage"),
					}),
				);
			} catch (error) {
				if (!(error instanceof SessionHistoryReaderError)) {
					throw error;
				}
				const response = historyError(error);

				return context.json({ error: response.message }, response.status);
			}
		})
		.get("/api/attempts/session/:caseId/:uuid/history", async (context) => {
			try {
				return context.json(
					await readSessionAttemptHistory({
						runsDirectory: dependencies.runsDirectory,
						caseId: context.req.param("caseId"),
						uuid: context.req.param("uuid"),
					}),
				);
			} catch (error) {
				if (!(error instanceof SessionHistoryReaderError)) {
					throw error;
				}
				const response = historyError(error);

				return context.json({ error: response.message }, response.status);
			}
		})
		.get(
			"/api/groups/:groupId/reps/:repId/attempt/history/:eventId",
			async (context) => {
				try {
					const detail = await readConfirmationAttemptHistoryDetail(
						{
							runsDirectory: dependencies.runsDirectory,
							groupId: context.req.param("groupId"),
							repId: context.req.param("repId"),
						},
						context.req.param("eventId"),
					);
					if (detail === undefined) {
						return context.json({ error: "No event at this locator" }, 404);
					}

					return context.json(detail);
				} catch (error) {
					if (!(error instanceof SessionHistoryReaderError)) {
						throw error;
					}
					const response = historyError(error);

					return context.json({ error: response.message }, response.status);
				}
			},
		)
		.get(
			"/api/groups/:groupId/reps/:repId/attempt/history",
			async (context) => {
				try {
					return context.json(
						await readConfirmationAttemptHistory({
							runsDirectory: dependencies.runsDirectory,
							groupId: context.req.param("groupId"),
							repId: context.req.param("repId"),
						}),
					);
				} catch (error) {
					if (!(error instanceof SessionHistoryReaderError)) {
						throw error;
					}
					const response = historyError(error);

					return context.json({ error: response.message }, response.status);
				}
			},
		)
		.get("/api/runs/:run/events", (context) => {
			const runId = context.req.param("run");

			return streamSSE(
				context,
				async (stream) => {
					try {
						const store = await openRunEventStore(
							runEventsDatabaseFile(dependencies.runsDirectory),
						);

						try {
							await streamRunEvents(store, runId, stream);
						} finally {
							store.close();
						}
					} catch (error) {
						/**
						 * streamSSE writes an uncaught rejection from this callback to
						 * the client verbatim (Hono's own SSE error handling, not
						 * app.onError, which never sees an error from inside a stream
						 * body), so a filesystem error opening the store must be
						 * redacted here the same way every other route redacts one.
						 */
						const message =
							error instanceof Error ? error.message : String(error);
						await stream.writeSSE({
							event: "error",
							data: redactAbsolutePaths(message),
						});
					}
				},
				/**
				 * A client that disconnects while the store is still opening
				 * (mkdir/Database are both real I/O now) can reach this
				 * before the try/finally above ever starts: nothing has
				 * opened yet for `finally` to close. Swallowing here, rather
				 * than leaving the callback's rejection unhandled, is correct
				 * because the client is already gone and there is nothing
				 * left to report the error to.
				 */
				() => Promise.resolve(),
			);
		})
		.get("/api/records/:id", async (context) => {
			try {
				const id = parseRecordId(context.req.param("id"));
				const file = await recordFileFor(id, dependencies.runsDirectory);
				if (!(await Bun.file(file).exists())) {
					throw new RefusedPreconditionError(
						`No record ${context.req.param("id")} at ${displayPath(file)}`,
					);
				}

				return context.body(await Bun.file(file).text(), 200, {
					"content-type": "application/json",
				});
			} catch (error) {
				if (error instanceof UsageError) {
					return context.json(
						{ error: redactAbsolutePaths(error.message) },
						400,
					);
				}
				if (error instanceof RefusedPreconditionError) {
					return context.json(
						{ error: redactAbsolutePaths(error.message) },
						404,
					);
				}

				throw error;
			}
		});

	/**
	 * No route-level throw reaches the browser with an absolute path: a route
	 * handler above catches every failure it anticipates, and this net catches
	 * whatever it did not, so a filesystem error surfacing from code neither
	 * this module nor `runHistoryReport` has wrapped is sanitized the same way.
	 * `redactAbsolutePaths` rather than `controlRelative`, because a corpus
	 * root or a target repository's path never lives under `CONTROL_DIR`, and
	 * `staleCheckpoints` (called on every `/api/runs` request per AC #2) can
	 * throw one of those in its message.
	 */
	app.onError((caughtError, context) => {
		const message =
			caughtError instanceof Error ? caughtError.message : String(caughtError);

		return context.json({ error: redactAbsolutePaths(message) }, 500);
	});

	return app;
};

export type ApiRoutes = ReturnType<typeof createApiApp>;
