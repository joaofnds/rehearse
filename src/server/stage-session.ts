import { basename, dirname } from "node:path";
import { z } from "zod";
import { stageTranscriptFile, TRANSCRIPT_FILE } from "#benchmark/checkpoint";
import type { Immutable, RecordedStageEvidence } from "#benchmark/contracts";
import type { RunEvent } from "#benchmark/run-events";
import { openRunEventStore } from "#benchmark/run-events";
import {
	checkpointsEntryForRun,
	runEventsDatabaseFile,
} from "#benchmark/run-layout";
import {
	canonicalRunsRoot,
	readVerifiedLines,
	SessionHistoryReaderError,
	verifiedDirectoryWhenPresent,
	verifiedFile,
} from "./session-history-reader";
import type { JudgedGrade, StageOfRun } from "./stage-record";
import { readStageRecord, verifiedStageOfRun } from "./stage-record";

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

const JUDGED_SECTIONS = ["hardBlockers", "requirements", "dimensions"] as const;

type JudgedSection = (typeof JUDGED_SECTIONS)[number];

/** One piece of evidence the stage judge cited from the session's exchanges. */
export interface CitedSpan {
	readonly section: JudgedSection;
	readonly item: string;
	/** The evidence's place in its item, as the evidence route numbers it. */
	readonly index: number;
	readonly claim: string;
	readonly quote?: string;
	/** The exchange the span sits in, from 1, where the evidence locates it. */
	readonly exchange?: number;
	/** Whose words in that exchange: the agent's message or the Product Owner's answer. */
	readonly field?: "message" | "productOwnerAnswer";
}

export type StageSession =
	| {
			readonly state: "closed";
			readonly spans: readonly CitedSpan[];
			readonly lineCount?: number;
			/** The preserved transcript, relative to the runs directory's parent. */
			readonly transcriptPath?: string;
	  }
	| {
			readonly state: "running";
			readonly lineCount: number;
			readonly lines: readonly SessionLine[];
			readonly latestToolCall?: string;
	  }
	| { readonly state: "not-started" }
	| { readonly state: "untracked" };

/** What one content block of a transcript message reads as. */
type TranscriptBlock =
	| { readonly kind: "text" | "tool" | "result"; readonly text: string }
	| { readonly kind: "other" };

function firstLine(text: string): string {
	return text.trim().split("\n", 1)[0] ?? "";
}

function spanPlace(
	evidence: Immutable<RecordedStageEvidence>,
): Pick<CitedSpan, "exchange" | "field"> {
	const { locator } = evidence;

	return locator?.kind === "exchange"
		? { exchange: locator.exchange + 1, field: locator.field }
		: {};
}

function citedSpans(grade: Immutable<JudgedGrade>): readonly CitedSpan[] {
	return JUDGED_SECTIONS.flatMap((section) =>
		grade[section].flatMap(({ id, evidence }) =>
			evidence.flatMap((cited, index): CitedSpan[] => {
				if (cited.source !== "transcript") {
					return [];
				}

				return [
					{
						section,
						item: id,
						index,
						claim: cited.claim,
						...(cited.quote !== undefined && { quote: cited.quote }),
						...spanPlace(cited),
					},
				];
			}),
		),
	);
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

interface TranscriptWindow {
	readonly lineCount: number;
	readonly window: readonly string[];
}

async function lastLines(
	root: string,
	file: string,
	limit: number,
): Promise<TranscriptWindow> {
	const window: string[] = [];
	let lineCount = 0;
	for await (const text of readVerifiedLines(root, file)) {
		lineCount += 1;
		window.push(text);
		if (window.length > limit) {
			window.shift();
		}
	}

	return { lineCount, window };
}

async function transcriptTail(
	root: string,
	file: string,
): Promise<Extract<StageSession, { state: "running" }>> {
	const { lineCount, window } = await lastLines(root, file, TAIL_LINES);
	const firstLineNumber = lineCount - window.length + 1;
	const lines = window.flatMap((text, index) =>
		rowsOf(text, firstLineNumber + index),
	);
	const latestToolCall = lines.findLast(({ kind }) => kind === "tool")?.text;

	return latestToolCall === undefined
		? { state: "running", lineCount, lines }
		: { state: "running", lineCount, lines, latestToolCall };
}

/**
 * The stage's record is written once its session ends, whether the judge
 * then graded it, the run stopped on it, or the run died before the judge
 * finished, so its presence is what closes the session.
 */
async function closedStageSession(
	stageOfRun: StageOfRun,
): Promise<Extract<StageSession, { state: "closed" }> | undefined> {
	const record = await readStageRecord(stageOfRun);
	if (record.state === "absent") {
		return undefined;
	}

	const { runsRoot, run, stage } = stageOfRun;

	return {
		state: "closed",
		spans: record.state === "judged" ? citedSpans(record.grade) : [],
		...(await preservedTranscript(runsRoot, run, stage)),
	};
}

/**
 * The stage's transcript as its checkpoint preserved it, named relative to the
 * runs directory's parent, or nothing when the checkpoint kept no copy.
 */
async function preservedTranscript(
	runsRoot: string,
	run: string,
	stage: string,
): Promise<{ lineCount: number; transcriptPath: string } | undefined> {
	const checkpointsEntry = checkpointsEntryForRun(run);
	const checkpointDirectory = await verifiedDirectoryWhenPresent(runsRoot, [
		checkpointsEntry,
		stage,
	]);
	const transcriptFile =
		checkpointDirectory === undefined
			? undefined
			: await verifiedFile(
					runsRoot,
					checkpointDirectory,
					TRANSCRIPT_FILE,
					false,
				);
	if (transcriptFile === undefined) {
		return undefined;
	}

	const { lineCount } = await lastLines(runsRoot, transcriptFile, 0);

	return {
		lineCount,
		transcriptPath: [
			basename(runsRoot),
			checkpointsEntry,
			stage,
			TRANSCRIPT_FILE,
		].join("/"),
	};
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
	const stageOfRun = await verifiedStageOfRun(request);
	const { run, stage, manifest } = stageOfRun;
	const closed = await closedStageSession(stageOfRun);
	if (closed !== undefined) {
		return closed;
	}

	const start = await recordedStart(request.runsDirectory, run, stage);
	if (start === undefined) {
		return { state: "not-started" };
	}

	const { sessionId } = start;
	if (sessionId === undefined) {
		return { state: "untracked" };
	}

	if (!z.uuid().safeParse(sessionId).success) {
		throw new SessionHistoryReaderError(
			"refused",
			"The stage's recorded session id is not a session id",
		);
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
