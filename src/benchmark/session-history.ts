import { basename, isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import {
	costFromRate,
	UNPRICED_REASONS,
	usageIsZero,
} from "./context-evidence-contract";
import type { ContextRateCatalog } from "./context-evidence-contract";
import { isCorpusLayoutPath } from "./corpus-file";
import type { Immutable } from "./contracts";
import { jsonValueSchema } from "./json-value";
import type { JsonValue } from "./json-value";
import { pathIsWithin } from "./path-containment";
import type { TranscriptDiagnostics, TranscriptLocation } from "./transcript";

export const MAX_EVENT_DETAIL_BYTES = 65_536;

export type HistoryRegion = "starting-context" | "attempt" | "boundary-unknown";
export type HistorySourceKind =
	| "corpus"
	| "project"
	| "external"
	| "skill"
	| "tool-output"
	| "unclassified";
export type HistoryEventKind =
	| "call"
	| "result"
	| "instruction-delivery"
	| "unclassified";
export type HistoryEventState =
	| "invoked"
	| "delivered"
	| "recorded"
	| "failed"
	| "partial"
	| "unavailable";

export type HistoryEvidence =
	| { readonly state: "complete" }
	| { readonly state: "partial"; readonly reasons: readonly string[] }
	| { readonly state: "unavailable"; readonly reasons: readonly string[] };

export type TextMeasurement =
	| { readonly state: "complete"; readonly characters: number }
	| {
			readonly state: "partial";
			readonly observedCharacters: number;
			readonly reasons: readonly string[];
	  }
	| { readonly state: "unavailable"; readonly reasons: readonly string[] };

export interface SessionHistoryEvent {
	readonly id: string;
	readonly locator: TranscriptLocation;
	readonly region: HistoryRegion;
	readonly kind: HistoryEventKind;
	readonly state: HistoryEventState;
	readonly label: string;
	readonly timestamp?: string | undefined;
	readonly toolUseId?: string | undefined;
	readonly toolName?: string | undefined;
	readonly sourceId?: string | undefined;
	readonly measurement: TextMeasurement;
	readonly relatedEventIds: readonly string[];
	readonly deliveryOrdinal?: number | undefined;
}

export interface SessionHistorySource {
	readonly id: string;
	readonly kind: HistorySourceKind;
	readonly name: string;
	readonly path?: string | undefined;
	readonly region: HistoryRegion;
	readonly firstLocator: TranscriptLocation;
	readonly measurement: TextMeasurement;
	readonly observedDeliveryCount: number | undefined;
	readonly repeatDeliveryCount: number | undefined;
	readonly failedOccurrences: number;
	readonly partialOccurrences: number;
	readonly missingOccurrences: number;
	readonly unavailableOccurrences: number;
	readonly eventIds: readonly string[];
}

/**
 * A saved standalone or confirmation session attempt, identified by the case it
 * ran and its own attempt id.
 */
export interface SessionAttemptIdentity {
	readonly kind: "session";
	readonly caseId: string;
	readonly id: string;
	readonly model: string;
	readonly outcome: string;
	readonly corpusFiles: readonly {
		readonly path: string;
		readonly resolvedPath: string;
	}[];
}

/**
 * One pipeline stage at its checkpoint. A checkpoint records no attempt id and
 * no outcome, since it exists only for a stage that passed its grade, so the
 * run and stage name it and the lineage places it among the other stages.
 * Its declared corpus files carry hashes rather than resolved paths.
 */
export interface StageHistoryIdentity {
	readonly kind: "stage";
	readonly caseId: string;
	readonly run: string;
	readonly stage: string;
	readonly lineage: string;
	readonly upstream: string;
	readonly model: string;
	readonly effort?: string | undefined;
	readonly corpusFiles: readonly {
		readonly path: string;
		readonly sha256: string;
	}[];
}

export type SessionHistoryAttemptIdentity =
	| SessionAttemptIdentity
	| StageHistoryIdentity;

/**
 * The corpus files whose bytes were resolved to a real path before the session
 * ran. A saved session attempt records them; a pipeline stage does not, and
 * supplies an empty list, which is what routes its reads to the corpus layout
 * rule below rather than to the exact-path match.
 */
export interface ResolvedCorpusFile {
	readonly path: string;
	readonly resolvedPath: string;
}

/**
 * Why no raw transcript backs this report. Each cause is a different fact
 * about the record, so an operator reading "unavailable" learns which one
 * rather than being left to assume the provider failed.
 *
 * Two further causes have no record to read and so no variant here: a stage
 * that stopped on its grade wrote no checkpoint at all, and a replay writes no
 * transcript and removes the worktree whose name locates the provider's copy.
 */
export type HistoryUnavailableReason =
	| "provider-wrote-none"
	| "no-capture-recorded";

export interface SessionHistoryReportInput {
	readonly attempt: SessionHistoryAttemptIdentity;
	readonly resolvedCorpusFiles: readonly ResolvedCorpusFile[];
	readonly unavailableReason?: HistoryUnavailableReason | undefined;
	readonly transcript: string | undefined;
	readonly prefixLinesExcluded: number | undefined;
	readonly diagnostics?: Immutable<TranscriptDiagnostics> | undefined;
}

export type SessionHistoryReportMetadata = Omit<
	SessionHistoryReportInput,
	"transcript"
>;

export interface SessionHistoryReport {
	readonly schemaVersion: 1;
	readonly attempt: SessionHistoryAttemptIdentity;
	readonly evidence: HistoryEvidence;
	readonly boundary: "known" | "unknown";
	readonly startingContext: readonly SessionHistoryEvent[];
	readonly attemptEvents: readonly SessionHistoryEvent[];
	readonly boundaryUnknown: readonly SessionHistoryEvent[];
	readonly startingSources: readonly SessionHistorySource[];
	readonly sources: readonly SessionHistorySource[];
	readonly diagnostics?: Immutable<TranscriptDiagnostics> | undefined;
}

interface SourceIdentity {
	readonly id: string;
	readonly kind: HistorySourceKind;
	readonly name: string;
	readonly path?: string | undefined;
}

interface ParsedRow {
	readonly line: number;
	readonly timestamp: string | undefined;
	readonly cwd: string | undefined;
	readonly value: HistoryRecord | undefined;
	readonly blocks: readonly JsonValue[];
}

interface MutableEvent {
	readonly id: string;
	readonly locator: TranscriptLocation;
	readonly region: HistoryRegion;
	readonly kind: HistoryEventKind;
	readonly state: HistoryEventState;
	readonly label: string;
	readonly timestamp: string | undefined;
	readonly toolUseId?: string | undefined;
	readonly toolName?: string | undefined;
	readonly sourceId?: string | undefined;
	readonly measurement: TextMeasurement;
	readonly relatedEventIds: readonly string[];
	readonly deliveryOrdinal?: number | undefined;
	readonly content?: string | undefined;
	readonly snapshot?: string | undefined;
	readonly snapshotMeasurement?: TextMeasurement | undefined;
	readonly snapshotRange?: SourceSnapshotRange | undefined;
	readonly source: SourceIdentity | undefined;
	readonly isDelivery: boolean;
	readonly input?: HistoryBlockInput | undefined;
}

interface ProjectionState {
	readonly events: readonly MutableEvent[];
	readonly issues: readonly string[];
}

const historyContentSchema = z.union([z.string(), z.array(jsonValueSchema)]);
const historyRecordSchema = z.looseObject({
	timestamp: z.string().min(1).optional(),
	cwd: z.string().min(1).optional(),
	sourceToolUseID: z.string().min(1).optional(),
	message: z.looseObject({ content: historyContentSchema }).optional(),
	toolUseResult: z
		.looseObject({
			file: z
				.looseObject({
					content: z.string(),
					filePath: z.string().optional(),
					startLine: z.number().int().positive().optional(),
					numLines: z.number().int().nonnegative().optional(),
					totalLines: z.number().int().nonnegative().optional(),
				})
				.optional(),
		})
		.optional(),
});
type HistoryRecord = z.infer<typeof historyRecordSchema>;

const historyBlockInputSchema = z.record(z.string(), jsonValueSchema);
type HistoryBlockInput = z.infer<typeof historyBlockInputSchema>;
const historyToolCallSchema = z.looseObject({
	type: z.literal("tool_use"),
	id: z.string().min(1).optional(),
	name: z.string().min(1),
	input: historyBlockInputSchema.optional().default({}),
});
const historyToolResultSchema = z.looseObject({
	type: z.literal("tool_result"),
	tool_use_id: z.string().min(1).optional(),
	is_error: z.boolean().optional(),
	content: jsonValueSchema.optional(),
});
const historyTextBlockSchema = z.looseObject({
	type: z.literal("text"),
	text: z.string(),
});

function parsedRow(text: string, line: number): ParsedRow | undefined {
	if (text.trim() === "") {
		return undefined;
	}

	let value: HistoryRecord | undefined;
	try {
		const parsed = historyRecordSchema.safeParse(JSON.parse(text));
		value = parsed.success ? parsed.data : undefined;
	} catch {
		value = undefined;
	}
	const content = value?.message?.content;
	let blocks: readonly JsonValue[] = [];
	const list = z.array(jsonValueSchema).safeParse(content);
	if (list.success) {
		blocks = list.data.length === 0 ? [null] : list.data;
	} else {
		const string = z.string().safeParse(content);
		blocks = string.success ? [string.data] : [null];
	}

	return {
		line,
		timestamp: value?.timestamp,
		cwd: value?.cwd,
		value,
		blocks,
	};
}

function parsedRows(transcript: string): readonly ParsedRow[] {
	return transcript
		.split("\n")
		.flatMap((text, index) => parsedRow(text, index + 1) ?? []);
}

function regionFor(
	line: number,
	prefixLinesExcluded: number | undefined,
): HistoryRegion {
	if (prefixLinesExcluded === undefined) {
		return "boundary-unknown";
	}

	return line <= prefixLinesExcluded ? "starting-context" : "attempt";
}

function locatorId(location: Readonly<TranscriptLocation>): string {
	return `${location.line}:${location.block}`;
}

function countCharacters(text: string): number {
	// Unicode code points are the shaped measurement unit; grapheme clusters and
	// UTF-16 code units would both answer a different question.
	// oxlint-disable-next-line typescript/no-misused-spread
	return [...text].length;
}

interface MeasuredContent {
	readonly text: string | undefined;
	readonly measurement: TextMeasurement;
}

function measureContent(value: JsonValue | undefined): MeasuredContent {
	const string = z.string().safeParse(value);
	if (string.success) {
		return {
			text: string.data,
			measurement: {
				state: "complete",
				characters: countCharacters(string.data),
			},
		};
	}
	const list = z.array(jsonValueSchema).safeParse(value);
	if (!list.success) {
		return {
			text: undefined,
			measurement: { state: "unavailable", reasons: ["unsupported text body"] },
		};
	}

	const texts: string[] = [];
	let unsupported = false;
	for (const entry of list.data) {
		const text = historyTextBlockSchema.safeParse(entry);
		if (text.success) {
			texts.push(text.data.text);
		} else {
			unsupported = true;
		}
	}
	const joined = texts.join("");
	if (texts.length === 0) {
		return {
			text: undefined,
			measurement: { state: "unavailable", reasons: ["unsupported text body"] },
		};
	}
	if (unsupported) {
		return {
			text: joined,
			measurement: {
				state: "partial",
				observedCharacters: countCharacters(joined),
				reasons: ["mixed supported and unsupported body blocks"],
			},
		};
	}

	return {
		text: joined,
		measurement: { state: "complete", characters: countCharacters(joined) },
	};
}

/**
 * A caller with no resolved corpus paths has only the read path to go on. Both
 * corpus roots a stage can read from, the live install and a worktree overlay,
 * put the layout path after the last `.claude/` segment, so that suffix is the
 * name the checkpoint's declared entries are already written in.
 *
 * Gating this on the resolved list being empty is load-bearing: applied to a
 * session attempt it would reclassify a target repository's own nested
 * `.claude` directory as corpus.
 */
function corpusLayoutPathUnder(normalizedPath: string): string | undefined {
	const marker = "/.claude/";
	const at = normalizedPath.lastIndexOf(marker);
	if (at === -1) {
		return undefined;
	}

	const suffix = normalizedPath.slice(at + marker.length);

	return isCorpusLayoutPath(suffix) ? suffix : undefined;
}

/**
 * The corpus name for a read, from the evidence the caller holds. A session
 * attempt supplies resolved paths and gets an exact match; a stage supplies
 * none and falls back to the layout rule, which is why the two cannot both
 * apply to one read.
 */
function declaredCorpusPath(
	normalizedObserved: string | undefined,
	resolvedCorpusFiles: readonly ResolvedCorpusFile[],
): string | undefined {
	if (normalizedObserved === undefined) {
		return undefined;
	}

	if (resolvedCorpusFiles.length === 0) {
		return corpusLayoutPathUnder(normalizedObserved);
	}

	return resolvedCorpusFiles.find(
		({ resolvedPath }) => resolve(resolvedPath) === normalizedObserved,
	)?.path;
}

function sourceForCall(
	toolName: string,
	input: Readonly<HistoryBlockInput>,
	cwd: string | undefined,
	location: Readonly<TranscriptLocation>,
	resolvedCorpusFiles: readonly ResolvedCorpusFile[],
): SourceIdentity {
	if (toolName === "Skill") {
		const parsedSkill = z.string().min(1).safeParse(input["skill"]);
		const skill = parsedSkill.success ? parsedSkill.data : undefined;
		if (skill !== undefined) {
			const path = `skills/${skill}/SKILL.md`;

			return { id: `skill:${path}`, kind: "skill", name: path, path };
		}
	}
	if (toolName !== "Read") {
		const id = locatorId(location);

		return {
			id: `tool-output:${id}`,
			kind: "tool-output",
			name: `${toolName} · ${id}`,
		};
	}

	const parsedPath = z.string().min(1).safeParse(input["file_path"]);
	const observed = parsedPath.success ? parsedPath.data : undefined;
	if (observed === undefined) {
		return {
			id: `unclassified:${locatorId(location)}`,
			kind: "unclassified",
			name: "Unclassified recorded content",
		};
	}
	const normalizedCwd = cwd === undefined ? undefined : resolve(cwd);
	let normalizedObserved: string | undefined;
	if (isAbsolute(observed)) {
		normalizedObserved = resolve(observed);
	} else if (normalizedCwd !== undefined) {
		normalizedObserved = resolve(normalizedCwd, observed);
	}
	const declaredCorpus = declaredCorpusPath(
		normalizedObserved,
		resolvedCorpusFiles,
	);
	if (declaredCorpus !== undefined) {
		return {
			id: `corpus:${declaredCorpus}`,
			kind: "corpus",
			name: declaredCorpus,
			path: declaredCorpus,
		};
	}
	if (cwd === undefined) {
		return isAbsolute(observed)
			? {
					id: `external:${observed}`,
					kind: "external",
					name: observed,
					path: observed,
				}
			: {
					id: `unclassified:${locatorId(location)}`,
					kind: "unclassified",
					name: "Unclassified recorded content",
				};
	}

	const savedCwd = resolve(cwd);
	const normalized = normalizedObserved ?? resolve(savedCwd, observed);
	if (!isAbsolute(observed) && !pathIsWithin(normalized, savedCwd)) {
		return {
			id: `unclassified:${locatorId(location)}`,
			kind: "unclassified",
			name: "Unclassified recorded content",
		};
	}
	const corpusRoot = resolve(savedCwd, ".claude");
	if (pathIsWithin(normalized, corpusRoot)) {
		const path = relative(corpusRoot, normalized) || basename(normalized);

		return { id: `corpus:${path}`, kind: "corpus", name: path, path };
	}
	if (pathIsWithin(normalized, savedCwd)) {
		const path = relative(savedCwd, normalized) || basename(normalized);

		return { id: `project:${path}`, kind: "project", name: path, path };
	}

	return {
		id: `external:${normalized}`,
		kind: "external",
		name: normalized,
		path: normalized,
	};
}

interface SnapshotEvidence {
	readonly text: string | undefined;
	readonly measurement: TextMeasurement;
	readonly range: SourceSnapshotRange | undefined;
}

function snapshotFor(row: Immutable<ParsedRow>): SnapshotEvidence {
	const file = row.value?.toolUseResult?.file;
	if (file === undefined) {
		return {
			text: undefined,
			measurement: {
				state: "unavailable",
				reasons: ["source snapshot unavailable"],
			},
			range: undefined,
		};
	}
	const base = measureContent(file.content);
	if (
		file.startLine === undefined ||
		file.numLines === undefined ||
		file.totalLines === undefined
	) {
		return {
			text: file.content,
			measurement: base.measurement,
			range: undefined,
		};
	}
	const complete = file.startLine === 1 && file.numLines >= file.totalLines;

	return {
		text: file.content,
		measurement:
			complete || base.measurement.state !== "complete"
				? base.measurement
				: {
						state: "partial",
						observedCharacters: base.measurement.characters,
						reasons: ["source snapshot is a partial line range"],
					},
		range: {
			startLine: file.startLine,
			deliveredLineCount: file.numLines,
			totalLineCount: file.totalLines,
			coverage: complete ? "complete" : "partial",
		},
	};
}

function baseEvent(
	row: Immutable<ParsedRow>,
	block: number,
	region: HistoryRegion,
): Pick<
	MutableEvent,
	"id" | "locator" | "region" | "timestamp" | "relatedEventIds"
> {
	const locator = { line: row.line, block };

	return {
		id: locatorId(locator),
		locator,
		region,
		timestamp: row.timestamp,
		relatedEventIds: [],
	};
}

function parseRowEvents(
	input: Immutable<SessionHistoryReportInput>,
	row: Immutable<ParsedRow>,
	retainBodies: boolean,
): ProjectionState {
	const events: MutableEvent[] = [];
	const issues: string[] = [];
	const region = regionFor(row.line, input.prefixLinesExcluded);
	for (const [index, value] of row.blocks.entries()) {
		const location = { line: row.line, block: index + 1 };
		const common = baseEvent(row, index + 1, region);
		const call = historyToolCallSchema.safeParse(value);
		if (call.success) {
			const { name: toolName, input: inputRecord } = call.data;
			const source = sourceForCall(
				toolName,
				inputRecord,
				row.cwd,
				location,
				input.resolvedCorpusFiles,
			);
			events.push({
				...common,
				kind: "call",
				state: "invoked",
				label: `${toolName} invoked`,
				toolUseId: call.data.id,
				toolName,
				sourceId: source.id,
				measurement: {
					state: "unavailable",
					reasons: ["tool invocation carries no result content"],
				},
				source,
				isDelivery: false,
				input: inputRecord,
			});
			continue;
		}
		const result = historyToolResultSchema.safeParse(value);
		if (result.success) {
			const measured = measureContent(result.data.content);
			const snapshot = snapshotFor(row);
			events.push({
				...common,
				kind: "result",
				state: result.data.is_error === true ? "failed" : "recorded",
				label:
					result.data.is_error === true
						? "Tool result · failed"
						: "Tool result",
				toolUseId: result.data.tool_use_id,
				measurement: measured.measurement,
				content: retainBodies ? measured.text : undefined,
				snapshot: retainBodies ? snapshot.text : undefined,
				snapshotMeasurement: snapshot.measurement,
				snapshotRange: snapshot.range,
				source: undefined,
				isDelivery: false,
			});
			continue;
		}

		const text = historyTextBlockSchema.safeParse(value);
		const measured = measureContent(text.success ? text.data.text : value);
		const companionId = row.value?.sourceToolUseID;
		events.push({
			...common,
			kind: companionId === undefined ? "unclassified" : "instruction-delivery",
			state: companionId === undefined ? "recorded" : "partial",
			label:
				companionId === undefined
					? "Unclassified recorded content"
					: "Skill delivery · partial",
			toolUseId: companionId,
			measurement: measured.measurement,
			content: retainBodies ? measured.text : undefined,
			source:
				companionId === undefined
					? {
							id: "unclassified",
							kind: "unclassified",
							name: "Unclassified recorded content",
						}
					: undefined,
			sourceId: companionId === undefined ? "unclassified" : undefined,
			isDelivery: false,
		});
		if (measured.measurement.state !== "complete") {
			issues.push(`unsupported content at ${common.id}`);
		}
	}

	return { events, issues };
}

function parseEvents(
	input: Immutable<SessionHistoryReportInput>,
	retainBodies = true,
): ProjectionState {
	if (input.transcript === undefined) {
		return { events: [], issues: [] };
	}
	const states = parsedRows(input.transcript).map((row) =>
		parseRowEvents(input, row, retainBodies),
	);

	return {
		events: states.flatMap(({ events }) => events),
		issues: states.flatMap(({ issues }) => issues),
	};
}

interface JoinIndices {
	readonly calls: ReadonlyMap<string, readonly MutableEvent[]>;
	readonly results: ReadonlyMap<string, readonly MutableEvent[]>;
	readonly deliveries: ReadonlyMap<string, readonly MutableEvent[]>;
}

function joinKey(event: Immutable<MutableEvent>): string | undefined {
	return event.toolUseId === undefined
		? undefined
		: `${event.region}:${event.toolUseId}`;
}

function unclassifiedSource(): SourceIdentity {
	return {
		id: "unclassified",
		kind: "unclassified",
		name: "Unclassified recorded content",
	};
}

function sourceForResult(
	call: Immutable<MutableEvent>,
): SourceIdentity | undefined {
	if (call.toolName !== "Skill") {
		return call.source;
	}

	return {
		id: `tool-output:${call.id}`,
		kind: "tool-output",
		name: `Skill result · ${call.id}`,
	};
}

function byRegionAndId(
	events: Immutable<readonly MutableEvent[]>,
	kind: "call" | "result" | "instruction-delivery",
): ReadonlyMap<string, readonly MutableEvent[]> {
	const grouped = new Map<string, MutableEvent[]>();
	for (const event of events) {
		if (event.kind !== kind || event.toolUseId === undefined) {
			continue;
		}
		const key = `${event.region}:${event.toolUseId}`;
		const found = grouped.get(key) ?? [];
		found.push(event);
		grouped.set(key, found);
	}

	return grouped;
}

interface JoinedEvent {
	readonly event: MutableEvent;
	readonly issues: readonly string[];
}

function joinCall(
	event: Immutable<MutableEvent>,
	indices: Readonly<JoinIndices>,
): JoinedEvent {
	const key = joinKey(event);
	if (key === undefined) {
		return { event, issues: [`missing tool call ID at ${event.id}`] };
	}
	const ambiguous = (indices.calls.get(key) ?? []).length !== 1;

	return {
		event: {
			...event,
			state: ambiguous ? "partial" : event.state,
			relatedEventIds: [
				...(indices.results.get(key) ?? []).map(({ id }) => id),
				...(indices.deliveries.get(key) ?? []).map(({ id }) => id),
			],
		},
		issues: ambiguous ? [`ambiguous tool call ${event.toolUseId}`] : [],
	};
}

function joinUnmatchedEvent(
	event: Immutable<MutableEvent>,
	events: Immutable<readonly MutableEvent[]>,
): JoinedEvent {
	const contextualCalls = events.filter(
		(candidate) =>
			candidate.kind === "call" &&
			candidate.toolUseId === event.toolUseId &&
			candidate.region !== event.region,
	);
	const [contextualCall] = contextualCalls.length === 1 ? contextualCalls : [];
	const source = unclassifiedSource();

	return {
		event: {
			...event,
			state: "partial",
			label: `${event.kind === "result" ? "Tool result" : "Skill delivery"} · partial`,
			source,
			sourceId: source.id,
			relatedEventIds: contextualCall === undefined ? [] : [contextualCall.id],
		},
		issues: [`unmatched or ambiguous result ${event.id}`],
	};
}

function joinInstructionDelivery(
	event: Immutable<MutableEvent>,
	call: Immutable<MutableEvent>,
	deliveryMatches: Immutable<readonly MutableEvent[]>,
): JoinedEvent {
	const ambiguous = call.toolName !== "Skill" || deliveryMatches.length !== 1;

	return {
		event: {
			...event,
			state: ambiguous ? "partial" : "delivered",
			label: ambiguous ? "Skill delivery · partial" : "Skill delivered",
			source: ambiguous ? unclassifiedSource() : call.source,
			sourceId: ambiguous ? "unclassified" : call.sourceId,
			isDelivery: !ambiguous,
			relatedEventIds: [call.id],
		},
		issues: ambiguous ? [`ambiguous Skill delivery ${event.id}`] : [],
	};
}

function joinResult(
	event: Immutable<MutableEvent>,
	call: Immutable<MutableEvent>,
	resultMatches: Immutable<readonly MutableEvent[]>,
): JoinedEvent {
	const source = sourceForResult(call);
	const ambiguous = resultMatches.length !== 1;
	if (event.state === "failed") {
		return {
			event: {
				...event,
				label: `${call.toolName ?? "Tool"} result · failed`,
				toolName: call.toolName,
				source,
				sourceId: source?.id,
				relatedEventIds: [call.id],
			},
			issues: ambiguous
				? [
						`ambiguous tool result ${event.toolUseId ?? "without ID"} at ${event.id}`,
					]
				: [],
		};
	}
	const delivered =
		call.toolName === "Read" &&
		!ambiguous &&
		event.measurement.state !== "unavailable";
	const unavailable = event.measurement.state === "unavailable";
	let resultState: HistoryEventState = "recorded";
	if (ambiguous) {
		resultState = "partial";
	} else if (delivered) {
		resultState = "delivered";
	} else if (unavailable) {
		resultState = "unavailable";
	}

	return {
		event: {
			...event,
			state: resultState,
			label: delivered
				? "Read delivered"
				: `${call.toolName ?? "Tool"} result${ambiguous ? " · partial" : ""}`,
			toolName: call.toolName,
			source,
			sourceId: source?.id,
			isDelivery: delivered,
			relatedEventIds: [call.id],
		},
		issues: ambiguous
			? [
					`ambiguous tool result ${event.toolUseId ?? "without ID"} at ${event.id}`,
				]
			: [],
	};
}

function expectedDeliveryEvents(
	call: Immutable<MutableEvent>,
	events: Immutable<readonly MutableEvent[]>,
): readonly MutableEvent[] {
	const expectedKind =
		call.toolName === "Read" ? "result" : "instruction-delivery";

	return events.filter(
		(candidate) =>
			candidate.kind === expectedKind &&
			call.relatedEventIds.includes(candidate.id),
	);
}

function joinNonCall(
	event: Immutable<MutableEvent>,
	indices: Readonly<JoinIndices>,
	events: Immutable<readonly MutableEvent[]>,
): JoinedEvent {
	const key = joinKey(event);
	const callMatches = key === undefined ? [] : (indices.calls.get(key) ?? []);
	const [call] = callMatches.length === 1 ? callMatches : [];
	if (call === undefined) {
		return joinUnmatchedEvent(event, events);
	}
	if (event.kind === "instruction-delivery") {
		return joinInstructionDelivery(
			event,
			call,
			key === undefined ? [] : (indices.deliveries.get(key) ?? []),
		);
	}

	return joinResult(
		event,
		call,
		key === undefined ? [] : (indices.results.get(key) ?? []),
	);
}

function missingDeliveryIssues(
	events: Immutable<readonly MutableEvent[]>,
): readonly string[] {
	return events.flatMap((event) => {
		const expectsDelivery =
			event.toolName === "Read" || event.toolName === "Skill";
		const key = joinKey(event);
		if (event.kind !== "call" || !expectsDelivery || key === undefined) {
			return [];
		}
		const candidates = expectedDeliveryEvents(event, events);
		const failed = events.some(
			(candidate) =>
				event.relatedEventIds.includes(candidate.id) &&
				candidate.state === "failed",
		);

		return candidates.length > 0 || failed
			? []
			: [`missing delivery for ${event.id}`];
	});
}

function markUnavailableDeliveries(
	events: Immutable<readonly MutableEvent[]>,
): readonly MutableEvent[] {
	return events.map((event) => {
		if (
			event.kind !== "call" ||
			(event.toolName !== "Read" && event.toolName !== "Skill")
		) {
			return event;
		}
		const related = events.filter((candidate) =>
			event.relatedEventIds.includes(candidate.id),
		);
		if (
			expectedDeliveryEvents(event, events).length > 0 ||
			related.some(({ state }) => state === "failed")
		) {
			return event;
		}

		return {
			...event,
			state: "unavailable",
			label: `${event.toolName} invoked · delivery unavailable`,
		};
	});
}

function numberDeliveries(
	events: Immutable<readonly MutableEvent[]>,
): readonly MutableEvent[] {
	const ordinals = new Map<string, number>();

	return events.map((event) => {
		if (
			!event.isDelivery ||
			event.sourceId === undefined ||
			event.region === "boundary-unknown"
		) {
			return event;
		}
		const key = `${event.region}:${event.sourceId}`;
		const next = (ordinals.get(key) ?? 0) + 1;
		ordinals.set(key, next);

		return {
			...event,
			deliveryOrdinal: next,
			label: `${event.label} · ${next === 1 ? "first" : "subsequent"}`,
		};
	});
}

function joinEvents(state: Immutable<ProjectionState>): ProjectionState {
	const indices = {
		calls: byRegionAndId(state.events, "call"),
		results: byRegionAndId(state.events, "result"),
		deliveries: byRegionAndId(state.events, "instruction-delivery"),
	};
	const joined = state.events.map((event): JoinedEvent => {
		if (event.kind === "unclassified") {
			return { event, issues: [] };
		}

		return event.kind === "call"
			? joinCall(event, indices)
			: joinNonCall(event, indices, state.events);
	});
	const joinedEvents = joined.map(({ event }) => event);
	const events = numberDeliveries(markUnavailableDeliveries(joinedEvents));

	return {
		events,
		issues: [
			...state.issues,
			...joined.flatMap(({ issues }) => issues),
			...missingDeliveryIssues(events),
			...events.flatMap((event) =>
				event.kind !== "result" || event.measurement.state === "complete"
					? []
					: event.measurement.reasons.map(
							(reason) => `${reason} at ${event.id}`,
						),
			),
		],
	};
}

function observedCharacters(measurement: Readonly<TextMeasurement>): number {
	if (measurement.state === "complete") {
		return measurement.characters;
	}
	if (measurement.state === "partial") {
		return measurement.observedCharacters;
	}

	return 0;
}

function sourceMeasurement(
	events: Immutable<readonly MutableEvent[]>,
): TextMeasurement {
	const measured = events.filter(({ kind }) => kind !== "call");
	const observed = measured.reduce(
		(total, { measurement }) => total + observedCharacters(measurement),
		0,
	);
	const partial = measured.filter(
		({ measurement }) => measurement.state === "partial",
	);
	const unavailable = measured.filter(
		({ measurement }) => measurement.state === "unavailable",
	);
	if (partial.length > 0 || unavailable.length > 0) {
		const reasons = new Set([
			...partial.flatMap(({ measurement }) =>
				measurement.state === "partial" ? measurement.reasons : [],
			),
			...unavailable.flatMap(({ measurement }) =>
				measurement.state === "unavailable" ? measurement.reasons : [],
			),
		]);
		return {
			state: "partial",
			observedCharacters: observed,
			reasons: [...reasons],
		};
	}
	if (measured.length === 0) {
		return { state: "unavailable", reasons: ["no recorded result"] };
	}

	return { state: "complete", characters: observed };
}

function sourcesFor(
	events: Immutable<readonly MutableEvent[]>,
	region: HistoryRegion,
): readonly SessionHistorySource[] {
	const grouped = new Map<string, MutableEvent[]>();
	for (const event of events) {
		if (event.region !== region || event.sourceId === undefined) {
			continue;
		}
		const found = grouped.get(event.sourceId) ?? [];
		found.push(event);
		grouped.set(event.sourceId, found);
	}

	return [...grouped].map(([id, sourceEvents]) => {
		const [first] = sourceEvents;
		if (first === undefined) {
			throw new Error(`Source ${id} has no event`);
		}
		const identity = sourceEvents.find(
			({ source: eventSource }) => eventSource !== undefined,
		)?.source;
		const observedDeliveryCount = sourceEvents.filter(
			({ isDelivery }) => isDelivery,
		).length;
		const missingDeliveries = sourceEvents.filter(
			(event) =>
				event.kind === "call" &&
				(event.toolName === "Read" || event.toolName === "Skill") &&
				expectedDeliveryEvents(event, sourceEvents).length === 0 &&
				!sourceEvents.some(
					(candidate) =>
						event.relatedEventIds.includes(candidate.id) &&
						candidate.state === "failed",
				),
		).length;
		const countsAvailable = region !== "boundary-unknown";

		return {
			id,
			kind: identity?.kind ?? "unclassified",
			name: identity?.name ?? "Unclassified recorded content",
			path: identity?.path,
			region,
			firstLocator: first.locator,
			measurement: sourceMeasurement(sourceEvents),
			observedDeliveryCount: countsAvailable
				? observedDeliveryCount
				: undefined,
			repeatDeliveryCount: countsAvailable
				? Math.max(0, observedDeliveryCount - 1)
				: undefined,
			failedOccurrences: sourceEvents.filter(({ state }) => state === "failed")
				.length,
			partialOccurrences: sourceEvents.filter(
				({ state }) => state === "partial",
			).length,
			missingOccurrences: missingDeliveries,
			unavailableOccurrences: sourceEvents.filter(
				({ kind, state }) => kind !== "call" && state === "unavailable",
			).length,
			eventIds: sourceEvents.map(({ id: eventId }) => eventId),
		};
	});
}

function publicEvent(event: Immutable<MutableEvent>): SessionHistoryEvent {
	const {
		content: _content,
		snapshot: _snapshot,
		snapshotMeasurement: _snapshotMeasurement,
		snapshotRange: _snapshotRange,
		source: _source,
		isDelivery: _isDelivery,
		input: _input,
		...publicFields
	} = event;

	return publicFields;
}

const UNAVAILABLE_REASON_TEXT = {
	"provider-wrote-none":
		"the provider wrote no transcript for this stage session",
	"no-capture-recorded":
		"no raw transcript capture was recorded for this stage",
} satisfies Record<HistoryUnavailableReason, string>;

function missingTranscriptReport(
	input: Immutable<SessionHistoryReportMetadata>,
): SessionHistoryReport {
	const reason =
		input.unavailableReason === undefined
			? "transcript unavailable"
			: UNAVAILABLE_REASON_TEXT[input.unavailableReason];

	return {
		schemaVersion: 1,
		attempt: input.attempt,
		evidence: { state: "unavailable", reasons: [reason] },
		boundary: input.prefixLinesExcluded === undefined ? "unknown" : "known",
		startingContext: [],
		attemptEvents: [],
		boundaryUnknown: [],
		startingSources: [],
		sources: [],
		diagnostics: input.diagnostics,
	};
}

function reportFromProjection(
	input: Immutable<SessionHistoryReportMetadata>,
	projection: Immutable<ProjectionState>,
): SessionHistoryReport {
	let state = joinEvents(projection);
	if (state.events.length === 0) {
		state = { ...state, issues: [...state.issues, "empty transcript"] };
	}
	if (input.prefixLinesExcluded === undefined) {
		state = {
			...state,
			issues: [...state.issues, "attempt boundary unavailable"],
		};
	}
	if (input.diagnostics?.state === "partial") {
		state = {
			...state,
			issues: [
				...state.issues,
				...input.diagnostics.issues.map(({ kind }) => kind),
			],
		};
	}

	return {
		schemaVersion: 1,
		attempt: input.attempt,
		evidence:
			state.issues.length === 0
				? { state: "complete" }
				: { state: "partial", reasons: [...new Set(state.issues)] },
		boundary: input.prefixLinesExcluded === undefined ? "unknown" : "known",
		startingContext: state.events
			.filter(({ region }) => region === "starting-context")
			.map((event) => publicEvent(event)),
		attemptEvents: state.events
			.filter(({ region }) => region === "attempt")
			.map((event) => publicEvent(event)),
		boundaryUnknown: state.events
			.filter(({ region }) => region === "boundary-unknown")
			.map((event) => publicEvent(event)),
		startingSources: sourcesFor(state.events, "starting-context"),
		sources: [
			...sourcesFor(state.events, "attempt"),
			...sourcesFor(state.events, "boundary-unknown"),
		],
		diagnostics: input.diagnostics,
	};
}

/**
 * What a stage's declared corpus and its transcript say about each other. The
 * only key the two sides share is the corpus layout path: a declaration
 * carries a hash of bytes on disk, and a transcript carries the text that was
 * delivered, so a hash can never establish that a file entered context.
 *
 * "No observation recorded" is not absence from context. A stage that kept no
 * transcript records nothing about every file it declared.
 */
export type StageCorpusState =
	| "observed"
	| "no-observation-recorded"
	| "undeclared";

export interface StageCorpusEntry {
	readonly path: string;
	readonly state: StageCorpusState;
	readonly firstLocator?: TranscriptLocation | undefined;
}

export function stageCorpusReconciliation(
	report: Immutable<SessionHistoryReport>,
): readonly StageCorpusEntry[] {
	if (report.attempt.kind !== "stage") {
		return [];
	}

	const observed = new Map(
		[...report.startingSources, ...report.sources]
			.filter(({ kind }) => kind === "corpus")
			.map((source) => [source.name, source.firstLocator]),
	);
	const declared = report.attempt.corpusFiles.map(({ path }) => {
		const firstLocator = observed.get(path);

		return firstLocator === undefined
			? { path, state: "no-observation-recorded" as const }
			: { path, state: "observed" as const, firstLocator };
	});
	const declaredPaths = new Set(declared.map(({ path }) => path));
	const undeclared = [...observed.entries()]
		.filter(([path]) => !declaredPaths.has(path))
		.map(([path, firstLocator]) => ({
			path,
			state: "undeclared" as const,
			firstLocator,
		}));

	return [...declared, ...undeclared];
}

export function sessionHistoryReport(
	input: Immutable<SessionHistoryReportInput>,
): SessionHistoryReport {
	return input.transcript === undefined
		? missingTranscriptReport(input)
		: reportFromProjection(input, parseEvents(input, false));
}

export async function sessionHistoryReportFromLines(
	input: Immutable<SessionHistoryReportMetadata>,
	lines: AsyncIterable<string>,
): Promise<SessionHistoryReport> {
	const events: MutableEvent[] = [];
	const issues: string[] = [];
	let lineNumber = 0;
	const rowInput = { ...input, transcript: "" };
	for await (const text of lines) {
		lineNumber += 1;
		const row = parsedRow(text, lineNumber);
		if (row === undefined) {
			continue;
		}
		const state = parseRowEvents(rowInput, row, false);
		events.push(...state.events);
		issues.push(...state.issues);
	}

	return reportFromProjection(input, { events, issues });
}

export interface SessionHistoryDetail {
	readonly schemaVersion: 1;
	readonly eventId: string;
	readonly locator: TranscriptLocation;
	readonly kind: HistoryEventKind;
	readonly state: HistoryEventState;
	readonly deliveredText?: string | undefined;
	readonly sourceSnapshot?: string | undefined;
	readonly deliveredMeasurement: TextMeasurement;
	readonly snapshotMeasurement: TextMeasurement;
	readonly sourceSnapshotRange?: SourceSnapshotRange | undefined;
	readonly applicationTruncated: boolean;
	readonly relatedEventIds: readonly string[];
}

export interface SourceSnapshotRange {
	readonly startLine: number;
	readonly deliveredLineCount: number;
	readonly totalLineCount: number;
	readonly coverage: "complete" | "partial";
}

function utf8Prefix(text: string, budget: number): string {
	let bytes = 0;
	let prefix = "";
	for (const character of text) {
		const size = Buffer.byteLength(character, "utf8");
		if (bytes + size > budget) {
			break;
		}
		bytes += size;
		prefix += character;
	}

	return prefix;
}

interface AllocatedDetailBodies {
	readonly deliveredText: string | undefined;
	readonly sourceSnapshot: string | undefined;
	readonly truncated: boolean;
}

function allocateDetailBodies(
	delivered: string | undefined,
	snapshot: string | undefined,
): AllocatedDetailBodies {
	const bodies = [delivered, snapshot].filter(
		(value): value is string => value !== undefined,
	);
	if (bodies.length === 0) {
		return {
			deliveredText: undefined,
			sourceSnapshot: undefined,
			truncated: false,
		};
	}
	if (bodies.length === 1) {
		const [body = ""] = bodies;
		const excerpt = utf8Prefix(body, MAX_EVENT_DETAIL_BYTES);

		return {
			deliveredText: delivered === undefined ? undefined : excerpt,
			sourceSnapshot: snapshot === undefined ? undefined : excerpt,
			truncated: excerpt !== body,
		};
	}

	const half = Math.floor(MAX_EVENT_DETAIL_BYTES / 2);
	let deliveredText = utf8Prefix(delivered ?? "", half);
	let sourceSnapshot = utf8Prefix(snapshot ?? "", half);
	const remaining =
		MAX_EVENT_DETAIL_BYTES -
		Buffer.byteLength(deliveredText, "utf8") -
		Buffer.byteLength(sourceSnapshot, "utf8");
	if (remaining > 0 && deliveredText === delivered) {
		sourceSnapshot = utf8Prefix(snapshot ?? "", half + remaining);
	} else if (remaining > 0 && sourceSnapshot === snapshot) {
		deliveredText = utf8Prefix(delivered ?? "", half + remaining);
	}

	return {
		deliveredText,
		sourceSnapshot,
		truncated: deliveredText !== delivered || sourceSnapshot !== snapshot,
	};
}

export function sessionHistoryDetail(
	input: Immutable<SessionHistoryReportInput>,
	eventId: string,
): SessionHistoryDetail | undefined {
	if (input.transcript === undefined) {
		return undefined;
	}
	const projection = joinEvents(parseEvents(input));
	const event = projection.events.find(({ id }) => id === eventId);
	if (event === undefined) {
		return undefined;
	}
	const excerpts = allocateDetailBodies(event.content, event.snapshot);

	return {
		schemaVersion: 1,
		eventId: event.id,
		locator: event.locator,
		kind: event.kind,
		state: event.state,
		deliveredText: excerpts.deliveredText,
		sourceSnapshot: excerpts.sourceSnapshot,
		deliveredMeasurement: event.measurement,
		snapshotMeasurement:
			event.snapshotMeasurement ?? measureContent(event.snapshot).measurement,
		sourceSnapshotRange: event.snapshotRange,
		applicationTruncated: excerpts.truncated,
		relatedEventIds: event.relatedEventIds,
	};
}

export function sessionHistoryDetailFromLine(
	report: Immutable<SessionHistoryReport>,
	resolvedCorpusFiles: readonly ResolvedCorpusFile[],
	eventId: string,
	lineText: string,
): SessionHistoryDetail | undefined {
	const event = [
		...report.startingContext,
		...report.attemptEvents,
		...report.boundaryUnknown,
	].find(({ id }) => id === eventId);
	if (event === undefined) {
		return undefined;
	}
	const row = parsedRow(lineText, event.locator.line);
	if (row === undefined) {
		return undefined;
	}
	let prefixLinesExcluded: number | undefined;
	if (event.region === "starting-context") {
		prefixLinesExcluded = event.locator.line;
	} else if (event.region === "attempt") {
		prefixLinesExcluded = 0;
	}
	const raw = parseRowEvents(
		{
			attempt: report.attempt,
			resolvedCorpusFiles,
			transcript: "",
			prefixLinesExcluded,
			diagnostics: report.diagnostics,
		},
		row,
		true,
	).events.find(({ id }) => id === eventId);
	if (raw === undefined) {
		return undefined;
	}
	const excerpts = allocateDetailBodies(raw.content, raw.snapshot);

	return {
		schemaVersion: 1,
		eventId: event.id,
		locator: event.locator,
		kind: event.kind,
		state: event.state,
		deliveredText: excerpts.deliveredText,
		sourceSnapshot: excerpts.sourceSnapshot,
		deliveredMeasurement: raw.measurement,
		snapshotMeasurement:
			raw.snapshotMeasurement ?? measureContent(raw.snapshot).measurement,
		sourceSnapshotRange: raw.snapshotRange,
		applicationTruncated: excerpts.truncated,
		relatedEventIds: event.relatedEventIds,
	};
}

export interface SessionHistoryRequestUsage {
	readonly inputTokens: number;
	readonly outputTokens: number;
	readonly cacheReadTokens: number;
	readonly cacheWriteTokens: number;
}

export type SessionHistoryCacheWriteSplit =
	| {
			readonly state: "complete";
			readonly fiveMinuteTokens: number;
			readonly oneHourTokens: number;
	  }
	| { readonly state: "missing"; readonly reasons: readonly string[] }
	| { readonly state: "conflict"; readonly reasons: readonly string[] };

export type SessionHistoryRequestEntry = {
	readonly requestId: string | undefined;
	readonly line: number;
	readonly region: HistoryRegion;
	readonly model?: string | undefined;
	readonly modelState?: "conflict" | undefined;
} & (
	| {
			readonly usageState: "complete";
			readonly usage: SessionHistoryRequestUsage;
			readonly totalInputTokens: number;
			readonly cumulativeTotalInputTokens: number;
			readonly cacheWriteSplit: SessionHistoryCacheWriteSplit;
	  }
	| { readonly usageState: "conflict" }
);

export type SessionHistoryAttemptTotals =
	| {
			readonly state: "complete";
			readonly requestCount: number;
			readonly usage: SessionHistoryRequestUsage;
			readonly totalInputTokens: number;
	  }
	| {
			readonly state: "incomplete";
			readonly requestCount: number;
			readonly countedRequestCount: number;
			readonly usage: SessionHistoryRequestUsage;
			readonly totalInputTokens: number;
			readonly reasons: readonly string[];
	  }
	| { readonly state: "unavailable"; readonly reasons: readonly string[] };

export interface SessionHistoryRequestSeries {
	readonly name: "total input tokens";
	readonly measuresActiveContextWindow: false;
	readonly omits: readonly string[];
	readonly boundary: "known" | "unknown";
	readonly transcriptState: "saved" | "absent";
	readonly entries: readonly SessionHistoryRequestEntry[];
	readonly compactions: readonly SessionHistoryCompaction[];
	readonly attemptTotals: SessionHistoryAttemptTotals;
}

const BOUNDARY_ABSENT = "the transcript carries no attempt boundary";
const NO_CATALOG = "no rate catalog was supplied";
const TRANSCRIPT_ABSENT = "the attempt has no saved transcript";

function attemptTotals(
	entries: readonly SessionHistoryRequestEntry[],
	boundary: "known" | "unknown",
	transcriptState: "saved" | "absent",
): SessionHistoryAttemptTotals {
	if (transcriptState === "absent") {
		return { state: "unavailable", reasons: [TRANSCRIPT_ABSENT] };
	}
	if (boundary === "unknown") {
		return { state: "unavailable", reasons: [BOUNDARY_ABSENT] };
	}

	const inRegion = entries.filter(({ region }) => region === "attempt");
	const usage = {
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
	};
	let counted = 0;
	for (const entry of inRegion) {
		if (entry.usageState !== "complete") {
			continue;
		}
		counted += 1;
		usage.inputTokens += entry.usage.inputTokens;
		usage.outputTokens += entry.usage.outputTokens;
		usage.cacheReadTokens += entry.usage.cacheReadTokens;
		usage.cacheWriteTokens += entry.usage.cacheWriteTokens;
	}
	const totals = {
		requestCount: inRegion.length,
		usage,
		totalInputTokens: totalInputTokens(usage),
	};
	if (counted === inRegion.length) {
		return { state: "complete", ...totals };
	}

	return {
		state: "incomplete",
		...totals,
		countedRequestCount: counted,
		reasons: [
			`${inRegion.length - counted} of ${inRegion.length} attempt-region requests carry no settled usage`,
		],
	};
}

const TOTAL_INPUT_TOKENS_OMITS = [
	"the request's own output tokens",
	"the model's context window limit, which the transcript does not carry",
] as const;

const cacheCreationSchema = z.looseObject({
	ephemeral_5m_input_tokens: z.number().int().nonnegative(),
	ephemeral_1h_input_tokens: z.number().int().nonnegative(),
});

const requestUsageSchema = z.looseObject({
	input_tokens: z.number().int().nonnegative(),
	output_tokens: z.number().int().nonnegative(),
	cache_read_input_tokens: z.number().int().nonnegative(),
	cache_creation_input_tokens: z.number().int().nonnegative(),
	cache_creation: jsonValueSchema.nullish(),
});

const requestRowSchema = z.looseObject({
	type: z.literal("assistant"),
	requestId: z.string().min(1).nullish(),
	message: z.looseObject({
		model: z.string().min(1).optional(),
		usage: requestUsageSchema,
	}),
});

const compactionRowSchema = z
	.object({
		type: z.literal("system"),
		subtype: z.literal("compact_boundary"),
		compactMetadata: z.object({ trigger: z.string().min(1) }).loose(),
	})
	.loose();

export interface SessionHistoryCompaction {
	readonly line: number;
	readonly trigger: string;
	readonly region: HistoryRegion;
}

interface ParsedCompactionRow {
	readonly line: number;
	readonly trigger: string;
}

interface ParsedRequestRow {
	readonly requestId: string | undefined;
	readonly line: number;
	readonly model: string | undefined;
	readonly usage: SessionHistoryRequestUsage;
	readonly cacheWriteSplit: SessionHistoryCacheWriteSplit;
}

const transcriptLineSchema = z.union([requestRowSchema, compactionRowSchema]);

type TranscriptLine = Immutable<z.infer<typeof transcriptLineSchema>>;

/**
 * Decodes only the two row kinds the series reads. Walking the whole line as
 * generic JSON doubled the time to build a series from the largest saved
 * transcript, and validated nothing either reader needs.
 */
function transcriptRow(text: string): TranscriptLine | undefined {
	if (text.trim() === "") {
		return undefined;
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		return undefined;
	}
	const row = transcriptLineSchema.safeParse(parsed);

	return row.success ? row.data : undefined;
}

function parsedCompactionRow(
	parsed: TranscriptLine,
	line: number,
): ParsedCompactionRow | undefined {
	const row = compactionRowSchema.safeParse(parsed);
	if (!row.success) {
		return undefined;
	}

	return { line, trigger: row.data.compactMetadata.trigger };
}

function parsedRequestRow(
	parsed: TranscriptLine,
	line: number,
): ParsedRequestRow | undefined {
	const row = requestRowSchema.safeParse(parsed);
	if (!row.success) {
		return undefined;
	}

	const { usage } = row.data.message;

	return {
		requestId: row.data.requestId ?? undefined,
		line,
		model: row.data.message.model,
		usage: {
			inputTokens: usage.input_tokens,
			outputTokens: usage.output_tokens,
			cacheReadTokens: usage.cache_read_input_tokens,
			cacheWriteTokens: usage.cache_creation_input_tokens,
		},
		cacheWriteSplit: cacheWriteSplit(
			usage.cache_creation,
			usage.cache_creation_input_tokens,
		),
	};
}

/**
 * The split is what makes a cache write priceable: the 5m and 1h rates differ
 * per model and are not derivable from one another. A split that does not add
 * up to the cache-write total prices nothing, so it is a conflict rather than
 * a number to lean on.
 */
function cacheWriteSplit(
	reported: JsonValue | null | undefined,
	cacheWriteTokens: number,
): SessionHistoryCacheWriteSplit {
	if (reported === null || reported === undefined) {
		return {
			state: "missing",
			reasons: ["the row reports no cache-creation TTL split"],
		};
	}
	const parsed = cacheCreationSchema.safeParse(reported);
	if (!parsed.success) {
		return {
			state: "missing",
			reasons: ["the row's cache-creation TTL split is unreadable"],
		};
	}
	const fiveMinuteTokens = parsed.data.ephemeral_5m_input_tokens;
	const oneHourTokens = parsed.data.ephemeral_1h_input_tokens;
	const total = fiveMinuteTokens + oneHourTokens;
	if (total !== cacheWriteTokens) {
		return {
			state: "conflict",
			reasons: [
				`the TTL split totals ${total} against ${cacheWriteTokens} cache-write tokens`,
			],
		};
	}

	return { state: "complete", fiveMinuteTokens, oneHourTokens };
}

function totalInputTokens(usage: Readonly<SessionHistoryRequestUsage>): number {
	return usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
}

function sameUsage(
	left: Readonly<SessionHistoryRequestUsage>,
	right: Readonly<SessionHistoryRequestUsage>,
): boolean {
	return (
		left.inputTokens === right.inputTokens &&
		left.outputTokens === right.outputTokens &&
		left.cacheReadTokens === right.cacheReadTokens &&
		left.cacheWriteTokens === right.cacheWriteTokens
	);
}

interface RequestDisagreements {
	readonly usage: ReadonlySet<string>;
	readonly model: ReadonlySet<string>;
	readonly firstRowByRequestId: ReadonlyMap<string, Readonly<ParsedRequestRow>>;
}

function requestDisagreements(
	rows: readonly Readonly<ParsedRequestRow>[],
): RequestDisagreements {
	const usage = new Set<string>();
	const model = new Set<string>();
	const firstRowByRequestId = new Map<string, Readonly<ParsedRequestRow>>();
	for (const row of rows) {
		if (row.requestId === undefined) {
			continue;
		}
		const first = firstRowByRequestId.get(row.requestId);
		if (first === undefined) {
			firstRowByRequestId.set(row.requestId, row);
			continue;
		}
		if (!sameUsage(first.usage, row.usage)) {
			usage.add(row.requestId);
		}
		if (first.model !== row.model) {
			model.add(row.requestId);
		}
	}

	return { usage, model, firstRowByRequestId };
}

type CompleteUsageEntry = Extract<
	SessionHistoryRequestEntry,
	{ usageState: "complete" }
>;

type UnaccumulatedEntry =
	| Omit<CompleteUsageEntry, "cumulativeTotalInputTokens">
	| Extract<SessionHistoryRequestEntry, { usageState: "conflict" }>;

function collapsedEntry(
	row: Readonly<ParsedRequestRow>,
	disagreements: Readonly<RequestDisagreements>,
	prefixLinesExcluded: number | undefined,
): UnaccumulatedEntry {
	const modelDisagrees =
		row.requestId !== undefined && disagreements.model.has(row.requestId);
	const identity = {
		requestId: row.requestId,
		line: row.line,
		region: regionFor(row.line, prefixLinesExcluded),
		...(modelDisagrees
			? { model: undefined, modelState: "conflict" as const }
			: { model: row.model }),
	};
	if (row.requestId !== undefined && disagreements.usage.has(row.requestId)) {
		return { ...identity, usageState: "conflict" };
	}

	return {
		...identity,
		usageState: "complete",
		usage: row.usage,
		totalInputTokens: totalInputTokens(row.usage),
		cacheWriteSplit: row.cacheWriteSplit,
	};
}

/**
 * The running total never resets. A compaction shortens the conversation the
 * provider sees without refunding the tokens already spent, so a reset would
 * read as a session that cost less than it did.
 */
function collapsedEntries(
	rows: readonly Readonly<ParsedRequestRow>[],
	prefixLinesExcluded: number | undefined,
): readonly SessionHistoryRequestEntry[] {
	const disagreements = requestDisagreements(rows);
	const entries: SessionHistoryRequestEntry[] = [];
	let cumulative = 0;
	for (const row of rows) {
		if (
			row.requestId !== undefined &&
			disagreements.firstRowByRequestId.get(row.requestId) !== row
		) {
			continue;
		}
		const entry = collapsedEntry(row, disagreements, prefixLinesExcluded);
		if (entry.usageState !== "complete") {
			entries.push(entry);
			continue;
		}
		cumulative += entry.totalInputTokens;
		entries.push({ ...entry, cumulativeTotalInputTokens: cumulative });
	}

	return entries;
}

export interface SessionHistoryRequestSeriesInput {
	/** Absent means no transcript was saved, which is not an empty one. */
	readonly transcript: string | undefined;
	readonly prefixLinesExcluded: number | undefined;
}

export function sessionHistoryRequestSeries(
	input: Readonly<SessionHistoryRequestSeriesInput>,
): SessionHistoryRequestSeries {
	const rows: ParsedRequestRow[] = [];
	const compactions: ParsedCompactionRow[] = [];
	for (const [index, text] of (input.transcript ?? "").split("\n").entries()) {
		const { request, compaction } = lineReadings(text, index + 1);
		if (request !== undefined) {
			rows.push(request);
		}
		if (compaction !== undefined) {
			compactions.push(compaction);
		}
	}

	return seriesFromRows(
		rows,
		compactions,
		input.prefixLinesExcluded,
		input.transcript === undefined ? "absent" : "saved",
	);
}

export type SessionHistoryRequestSeriesMetadata = Omit<
	SessionHistoryRequestSeriesInput,
	"transcript"
>;

export async function sessionHistoryRequestSeriesFromLines(
	input: Readonly<SessionHistoryRequestSeriesMetadata>,
	lines: AsyncIterable<string>,
): Promise<SessionHistoryRequestSeries> {
	const rows: ParsedRequestRow[] = [];
	const compactions: ParsedCompactionRow[] = [];
	let lineNumber = 0;
	for await (const text of lines) {
		lineNumber += 1;
		const { request, compaction } = lineReadings(text, lineNumber);
		if (request !== undefined) {
			rows.push(request);
		}
		if (compaction !== undefined) {
			compactions.push(compaction);
		}
	}

	return seriesFromRows(rows, compactions, input.prefixLinesExcluded, "saved");
}

interface TranscriptLineReadings {
	readonly request: ParsedRequestRow | undefined;
	readonly compaction: ParsedCompactionRow | undefined;
}

function lineReadings(text: string, line: number): TranscriptLineReadings {
	const decoded = transcriptRow(text);
	if (decoded === undefined) {
		return { request: undefined, compaction: undefined };
	}

	return {
		request: parsedRequestRow(decoded, line),
		compaction: parsedCompactionRow(decoded, line),
	};
}

function seriesFromRows(
	rows: readonly Readonly<ParsedRequestRow>[],
	compactionRows: readonly Readonly<ParsedCompactionRow>[],
	prefixLinesExcluded: number | undefined,
	transcriptState: "saved" | "absent",
): SessionHistoryRequestSeries {
	const boundary = prefixLinesExcluded === undefined ? "unknown" : "known";
	const entries = collapsedEntries(rows, prefixLinesExcluded);

	return {
		name: "total input tokens",
		measuresActiveContextWindow: false,
		omits: TOTAL_INPUT_TOKENS_OMITS,
		boundary,
		transcriptState,
		entries,
		compactions: compactionRows.map((compaction) => ({
			line: compaction.line,
			trigger: compaction.trigger,
			region: regionFor(compaction.line, prefixLinesExcluded),
		})),
		attemptTotals: attemptTotals(entries, boundary, transcriptState),
	};
}

export type SessionHistoryCostReading =
	| { readonly state: "complete"; readonly costUsd: number }
	| {
			readonly state: "incomplete";
			readonly costUsd: number;
			readonly pricedRequestCount: number;
			readonly requestCount: number;
			readonly reasons: readonly string[];
	  }
	| { readonly state: "unavailable"; readonly reasons: readonly string[] };

/**
 * Three readings, never folded into one. The provider's charge and a sum of
 * per-request calculations answer different questions, and the gap between
 * them is evidence about the catalog rather than an error to hide. Folding
 * them would make a missing rate look like a cost of zero.
 */
export interface SessionHistoryAttemptCost {
	readonly reported: SessionHistoryCostReading;
	readonly calculated: SessionHistoryCostReading;
	readonly difference: SessionHistoryCostReading;
}

export interface SessionHistoryAttemptCostInput {
	readonly series: SessionHistoryRequestSeries;
	readonly reportedCostUsd: number | undefined;
	readonly rates: ContextRateCatalog | undefined;
}

type PricedRequest =
	| { readonly state: "priced"; readonly costUsd: number }
	| { readonly state: "unpriced"; readonly reason: string };

function pricedRequest(
	entry: SessionHistoryRequestEntry,
	rates: ContextRateCatalog,
): PricedRequest {
	if (entry.usageState !== "complete") {
		return { state: "unpriced", reason: UNPRICED_REASONS["usage-conflict"] };
	}
	if (entry.modelState === "conflict") {
		return { state: "unpriced", reason: UNPRICED_REASONS["model-conflict"] };
	}
	const { model } = entry;
	if (model === undefined) {
		return { state: "unpriced", reason: UNPRICED_REASONS["model-missing"] };
	}
	const split = entry.cacheWriteSplit;
	if (split.state === "conflict") {
		return {
			state: "unpriced",
			reason: UNPRICED_REASONS["ttl-split-conflict"],
		};
	}
	if (split.state !== "complete") {
		return { state: "unpriced", reason: UNPRICED_REASONS["ttl-split-missing"] };
	}
	const usage = {
		inputTokens: entry.usage.inputTokens,
		outputTokens: entry.usage.outputTokens,
		cacheReadTokens: entry.usage.cacheReadTokens,
		cacheWrite5mTokens: split.fiveMinuteTokens,
		cacheWrite1hTokens: split.oneHourTokens,
	};
	if (usageIsZero(usage)) {
		return { state: "priced", costUsd: 0 };
	}
	const rate = rates.models.find((candidate) => candidate.model === model);
	if (rate === undefined) {
		return { state: "unpriced", reason: UNPRICED_REASONS["rates-missing"] };
	}

	return { state: "priced", costUsd: costFromRate(usage, rate) };
}

export type SessionHistoryRequestCost = PricedRequest;

/**
 * The same `pricedRequest` the summed reading uses, keyed by transcript line so
 * a row and the total can never disagree about what a request cost. Only
 * attempt-region requests are priced, because only those are what the summed
 * reading counts; a starting-context request is absent rather than zero.
 */
export function sessionHistoryRequestCosts(
	series: Readonly<SessionHistoryRequestSeries>,
	rates: ContextRateCatalog | undefined,
): ReadonlyMap<number, SessionHistoryRequestCost> {
	const costs = new Map<number, SessionHistoryRequestCost>();
	for (const entry of series.entries) {
		if (entry.region !== "attempt") {
			continue;
		}
		costs.set(
			entry.line,
			rates === undefined
				? { state: "unpriced", reason: NO_CATALOG }
				: pricedRequest(entry, rates),
		);
	}

	return costs;
}

function calculatedCost(
	series: SessionHistoryRequestSeries,
	rates: ContextRateCatalog | undefined,
): SessionHistoryCostReading {
	if (series.transcriptState === "absent") {
		return { state: "unavailable", reasons: [TRANSCRIPT_ABSENT] };
	}
	if (series.boundary === "unknown") {
		return { state: "unavailable", reasons: [BOUNDARY_ABSENT] };
	}
	if (rates === undefined) {
		return { state: "unavailable", reasons: [NO_CATALOG] };
	}

	const inRegion = series.entries.filter(({ region }) => region === "attempt");
	const reasons = new Set<string>();
	let costUsd = 0;
	let priced = 0;
	for (const entry of inRegion) {
		const result = pricedRequest(entry, rates);
		if (result.state === "priced") {
			costUsd += result.costUsd;
			priced += 1;
		} else {
			reasons.add(result.reason);
		}
	}
	if (priced === inRegion.length) {
		return { state: "complete", costUsd };
	}

	return {
		state: "incomplete",
		costUsd,
		pricedRequestCount: priced,
		requestCount: inRegion.length,
		reasons: [...reasons],
	};
}

export function sessionHistoryAttemptCost(
	input: Readonly<SessionHistoryAttemptCostInput>,
): SessionHistoryAttemptCost {
	const reported: SessionHistoryCostReading =
		input.reportedCostUsd === undefined
			? {
					state: "unavailable",
					reasons: ["the attempt record carries no provider cost"],
				}
			: { state: "complete", costUsd: input.reportedCostUsd };
	const calculated = calculatedCost(input.series, input.rates);

	return { reported, calculated, difference: difference(reported, calculated) };
}

function difference(
	reported: SessionHistoryCostReading,
	calculated: SessionHistoryCostReading,
): SessionHistoryCostReading {
	if (reported.state === "unavailable") {
		return {
			state: "unavailable",
			reasons: ["the provider reading is unavailable"],
		};
	}
	if (calculated.state === "unavailable") {
		return {
			state: "unavailable",
			reasons: ["the calculated reading is unavailable"],
		};
	}
	const costUsd = reported.costUsd - calculated.costUsd;
	if (reported.state === "complete" && calculated.state === "complete") {
		return { state: "complete", costUsd };
	}

	return {
		state: "incomplete",
		costUsd,
		pricedRequestCount:
			calculated.state === "incomplete" ? calculated.pricedRequestCount : 0,
		requestCount:
			calculated.state === "incomplete" ? calculated.requestCount : 0,
		reasons: [
			"a reading it is drawn from is incomplete",
			...(calculated.state === "incomplete" ? calculated.reasons : []),
		],
	};
}
