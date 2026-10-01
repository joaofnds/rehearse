import { dirname } from "node:path";
import { z } from "zod";
import { stageTranscriptFile } from "#benchmark/checkpoint";
import { openRunEventStore } from "#benchmark/run-events";
import {
	checkpointsEntryForRun,
	runEventsDatabaseFile,
} from "#benchmark/run-layout";
import {
	canonicalRunsRoot,
	parseIdentity,
	readVerifiedLines,
	runManifest,
	SessionHistoryReaderError,
	verifiedDirectory,
	verifiedFile,
} from "./session-history-reader";

/**
 * How many of the transcript's last lines a running stage's pane shows. Every
 * poll reads the whole file, so this bounds the answer, not the read.
 */
const TAIL_LINES = 200;
const MAX_TEXT_LENGTH = 1000;

export interface StageSessionRequest {
	readonly runsDirectory: string;
	readonly projectsDirectory: string;
	readonly run: string;
	readonly stage: string;
}

export type SessionLineKind = "user" | "assistant" | "tool" | "result";

export interface SessionLine {
	/** The line of the provider's transcript the row comes from, from 1. */
	readonly line: number;
	readonly kind: SessionLineKind;
	readonly text: string;
}

export type StageSession =
	| {
			readonly state: "running";
			readonly lineCount: number;
			readonly lines: readonly SessionLine[];
			readonly latestToolCall?: string;
	  }
	| { readonly state: "untracked" };

/** What one content block of a transcript message reads as. */
type TranscriptBlock =
	| { readonly kind: "text" | "tool" | "result"; readonly text: string }
	| { readonly kind: "other" };

function firstLine(text: string): string {
	return text.trim().split("\n", 1)[0] ?? "";
}

const toolUseBlockSchema = z
	.looseObject({
		type: z.literal("tool_use"),
		name: z.string(),
		input: z.looseObject({
			file_path: z.string().optional(),
			command: z.string().optional(),
			pattern: z.string().optional(),
			url: z.string().optional(),
			description: z.string().optional(),
		}),
	})
	.transform(({ name, input }): TranscriptBlock => {
		const target =
			input.file_path ??
			input.command ??
			input.pattern ??
			input.url ??
			input.description;

		return {
			kind: "tool",
			text: target === undefined ? name : `${name}  ${firstLine(target)}`,
		};
	});

const toolResultBlockSchema = z
	.looseObject({
		type: z.literal("tool_result"),
		content: z
			.union([
				z.string(),
				z
					.array(z.looseObject({ text: z.string().optional() }))
					.transform(
						(parts) => parts.find(({ text }) => text !== undefined)?.text,
					),
			])
			.optional(),
	})
	.transform(({ content }): TranscriptBlock => ({
		kind: "result",
		text: firstLine(content ?? ""),
	}));

const textBlockSchema = z
	.looseObject({ type: z.literal("text"), text: z.string() })
	.transform(({ text }): TranscriptBlock => ({
		kind: "text",
		text: text.trim(),
	}));

const otherBlockSchema = z
	.unknown()
	.transform((): TranscriptBlock => ({ kind: "other" }));

const messageContentSchema = z.union([
	z
		.string()
		.transform((text): TranscriptBlock[] => [
			{ kind: "text", text: text.trim() },
		]),
	z.array(
		z.union([
			toolUseBlockSchema,
			toolResultBlockSchema,
			textBlockSchema,
			otherBlockSchema,
		]),
	),
]);

const transcriptRecordSchema = z.looseObject({
	type: z.string(),
	isMeta: z.boolean().optional(),
	message: z.looseObject({ content: messageContentSchema }).optional(),
});

function shortened(text: string): string {
	return text.length > MAX_TEXT_LENGTH
		? `${text.slice(0, MAX_TEXT_LENGTH)}…`
		: text;
}

function rowOf(
	block: TranscriptBlock,
	line: number,
	textKind: "user" | "assistant",
): SessionLine | undefined {
	if (block.kind === "other" || block.text === "") {
		return undefined;
	}

	return {
		line,
		kind: block.kind === "text" ? textKind : block.kind,
		text: shortened(block.text),
	};
}

/**
 * The rows one transcript line shows. Only the conversation reads as rows:
 * a skill body or other record the provider marks as meta, and every record
 * that is not a user or assistant message, shows nothing.
 */
function rowsOf(text: string, line: number): readonly SessionLine[] {
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return [];
	}
	const record = transcriptRecordSchema.safeParse(parsed);
	if (
		!record.success ||
		record.data.isMeta === true ||
		record.data.message === undefined ||
		(record.data.type !== "user" && record.data.type !== "assistant")
	) {
		return [];
	}
	const textKind = record.data.type;

	return record.data.message.content.flatMap(
		(block) => rowOf(block, line, textKind) ?? [],
	);
}

async function transcriptTail(
	root: string,
	file: string,
): Promise<Extract<StageSession, { state: "running" }>> {
	const window: string[] = [];
	let lineCount = 0;
	for await (const text of readVerifiedLines(root, file)) {
		lineCount += 1;
		window.push(text);
		if (window.length > TAIL_LINES) {
			window.shift();
		}
	}
	const firstLineNumber = lineCount - window.length + 1;
	const lines = window.flatMap((text, index) =>
		rowsOf(text, firstLineNumber + index),
	);
	const latestToolCall = lines.findLast(({ kind }) => kind === "tool")?.text;

	return latestToolCall === undefined
		? { state: "running", lineCount, lines }
		: { state: "running", lineCount, lines, latestToolCall };
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

function recordedSessionId(
	runsDirectory: string,
	run: string,
	stage: string,
): Promise<string | undefined> {
	return openRunEventStore(runEventsDatabaseFile(runsDirectory)).then(
		(store) => {
			try {
				return store.latestStageStart({ runId: run, stage })?.sessionId;
			} finally {
				store.close();
			}
		},
	);
}

/**
 * A stage's session as the pane shows it. A running stage's transcript is the
 * provider's own file, found only from what the run recorded: the source root
 * its manifest names and the session id its stage start carries. No part of
 * that path comes from the request, and the file must be a real file inside
 * the projects directory.
 */
export async function readStageSession(
	request: Readonly<StageSessionRequest>,
): Promise<StageSession> {
	const run = parseIdentity(request.run);
	const stage = parseIdentity(request.stage);
	const runsRoot = await canonicalRunsRoot(request.runsDirectory);
	const checkpointsDirectory = await verifiedDirectory(runsRoot, [
		checkpointsEntryForRun(run),
	]);
	const manifest = await runManifest(runsRoot, checkpointsDirectory);
	if (!manifest.pipeline.stages.some(({ name }) => name === stage)) {
		throw new SessionHistoryReaderError(
			"not-found",
			"The run's pipeline has no such stage",
		);
	}

	const sessionId = await recordedSessionId(request.runsDirectory, run, stage);
	if (sessionId === undefined) {
		return { state: "untracked" };
	}
	const projectsRoot = await canonicalProjectsRoot(request.projectsDirectory);
	const recordedFile = stageTranscriptFile(manifest.sourceRoot, {
		sessionId,
		projectsDirectory: projectsRoot,
	});
	const file = await verifiedFile(
		projectsRoot,
		dirname(recordedFile),
		`${sessionId}.jsonl`,
		false,
	);

	return file === undefined
		? { state: "running", lineCount: 0, lines: [] }
		: transcriptTail(projectsRoot, file);
}
