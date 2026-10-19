import { dirname } from "node:path";

import { z } from "zod";

import { stageTranscriptFile } from "#benchmark/checkpoint";
import { openRunEventStore } from "#benchmark/run-events";
import type { RunEvent } from "#benchmark/run-events";
import { runEventsDatabaseFile } from "#benchmark/run-layout";
import {
	SessionHistoryReaderError,
	canonicalRunsRoot,
	readVerifiedLines,
	verifiedFile,
} from "#server/session-history-reader";
import type {
	StageSession,
	TranscriptWindow,
} from "#server/stage-session-contract";
import rowsOf from "#server/stage-session-rows-of";

const LINE_NUMBER_BASE = 1;

/**
 * How many of the transcript's last lines a running stage's pane shows. Every
 * poll reads the whole file, so this bounds the answer, not the read.
 */
const TAIL_LINES = 200;

async function transcriptTail(
	root: string,
	file: string,
): Promise<Extract<StageSession, { state: "running" }>> {
	const { lineCount, window } = await lastLines(root, file, TAIL_LINES);
	const firstLineNumber = lineCount - window.length + LINE_NUMBER_BASE;
	const lines = window.flatMap((text, index) =>
		rowsOf(text, firstLineNumber + index),
	);
	const latestToolCall = lines.findLast(({ kind }) => kind === "tool")?.text;

	return latestToolCall === undefined
		? { lineCount, lines, state: "running" }
		: { latestToolCall, lineCount, lines, state: "running" };
}

async function canonicalProjectsRoot(
	projectsDirectory: string,
): Promise<string> {
	try {
		return await canonicalRunsRoot(projectsDirectory);
	} catch (error) {
		if (
			error instanceof SessionHistoryReaderError &&
			error.kind === "not-found"
		) {
			throw new SessionHistoryReaderError(
				"not-found",
				"No provider projects directory",
			);
		}

		throw error;
	}
}

async function recordedStart(
	runsDirectory: string,
	run: string,
	stage: string,
): Promise<RunEvent | undefined> {
	const store = await openRunEventStore(runEventsDatabaseFile(runsDirectory));

	try {
		return store.latestStageStart({ runId: run, stage });
	} finally {
		store.close();
	}
}

interface RecordedTranscript {
	readonly projectsRoot: string;
	readonly file: string | undefined;
}

interface RunningSessionInput {
	readonly projectsDirectory: string;
	readonly sourceRoot: string;
	readonly sessionId: string;
}

async function recordedTranscript({
	projectsDirectory,
	sourceRoot,
	sessionId,
}: RunningSessionInput): Promise<RecordedTranscript> {
	if (!z.uuid().safeParse(sessionId).success) {
		throw new SessionHistoryReaderError(
			"refused",
			"The stage's recorded session id is not a session id",
		);
	}

	const projectsRoot = await canonicalProjectsRoot(projectsDirectory);
	const recordedFile = stageTranscriptFile(sourceRoot, {
		projectsDirectory: projectsRoot,
		sessionId,
	});
	const file = await verifiedFile(projectsRoot, {
		directory: dirname(recordedFile),
		name: `${sessionId}.jsonl`,
		required: false,
	});

	return { file, projectsRoot };
}

const TRANSCRIPT_LINE_COUNT_INCREMENT = 1;

async function lastLines(
	root: string,
	file: string,
	limit: number,
): Promise<TranscriptWindow> {
	const window: string[] = [];
	let lineCount = 0;
	for await (const text of readVerifiedLines(root, file)) {
		lineCount += TRANSCRIPT_LINE_COUNT_INCREMENT;
		window.push(text);
		if (window.length > limit) {
			window.shift();
		}
	}

	return { lineCount, window };
}

export { lastLines, recordedStart, recordedTranscript, transcriptTail };
