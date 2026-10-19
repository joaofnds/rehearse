import type { SSEStreamingApi } from "hono/streaming";

import {
	isTerminalRunEventKind,
	openRunEventStore,
} from "#benchmark/run-events";
import type { RunEvent, RunEventStore } from "#benchmark/run-events";
import { runEventsDatabaseFile } from "#benchmark/run-layout";
import { redactAbsolutePaths } from "#server/redact-path";

const FINAL_RUN_EVENT_OFFSET = -1;

const EMPTY_COLLECTION_LENGTH = 0;

const RUN_EVENTS_POLL_MS = 500;

interface RunEventStreamContext {
	readonly store: RunEventStore;
	readonly runId: string;
	readonly stream: Readonly<SSEStreamingApi>;
}

interface EventBatchWrite {
	readonly events: readonly RunEvent[];
	readonly stream: Readonly<SSEStreamingApi>;
}

async function writeEventBatch({
	events,
	stream,
}: EventBatchWrite): Promise<readonly RunEvent[]> {
	if (events.length === EMPTY_COLLECTION_LENGTH) {
		await stream.write(": keepalive\n\n");
	}
	await Array.fromAsync(events, async (event) => {
		await stream.writeSSE({ data: JSON.stringify(event) });
	});

	return events;
}

/** Read the next batch only after the consumer finishes writing the previous one. */
async function* runEventBatches({
	store,
	runId,
	stream,
}: RunEventStreamContext): AsyncGenerator<readonly RunEvent[]> {
	let sequence = 0;
	while (!stream.aborted) {
		const events = store.eventsSince(runId, sequence);
		yield writeEventBatch({ events, stream });
		sequence = events.at(FINAL_RUN_EVENT_OFFSET)?.sequence ?? sequence;
		if (events.some(({ kind }) => isTerminalRunEventKind(kind))) {
			return;
		}
	}
}

async function streamRunEvents(
	store: RunEventStore,
	runId: string,
	stream: Readonly<SSEStreamingApi>,
): Promise<void> {
	for await (const events of runEventBatches({ runId, store, stream })) {
		if (
			!events.some(({ kind }) => isTerminalRunEventKind(kind)) &&
			!stream.aborted
		) {
			await stream.sleep(RUN_EVENTS_POLL_MS);
		}
	}
}

interface RunEventStreamRequest {
	readonly runsDirectory: string;
	readonly runId: string;
	readonly stream: Readonly<SSEStreamingApi>;
}

/** Close the store before completing or reporting a stream failure. */
async function streamRunResponse({
	runsDirectory,
	runId,
	stream,
}: RunEventStreamRequest): Promise<void> {
	try {
		const store = await openRunEventStore(runEventsDatabaseFile(runsDirectory));
		try {
			await streamRunEvents(store, runId, stream);
		} finally {
			store.close();
		}
	} catch (error) {
		/** Hono sends stream callback errors verbatim rather than calling app.onError. */
		const message = error instanceof Error ? error.message : String(error);
		await stream.writeSSE({
			data: redactAbsolutePaths(message),
			event: "error",
		});
	}
}

export { streamRunResponse as default };
