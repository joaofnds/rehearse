import { z } from "zod";
import type { Immutable } from "./contracts";
import type { LineObserver } from "./file-lines";
import { fileLines, IGNORE_CARRY } from "./file-lines";
import type { JsonValue } from "./json-value";
import { jsonValueSchema } from "./json-value";
import { instructionsAttachmentSchema } from "./transcript-instruction-loads";

/**
 * The session file's format is the provider's, not ours, so a record type this
 * harness does not recognize reads as a record with no tool calls rather than
 * as a failure. A strict schema here would turn a new provider record type into
 * a failed attempt, which is a false negative on the thing being measured.
 */
const toolUseSchema = z.looseObject({
	type: z.literal("tool_use"),
	id: z.string().min(1).optional(),
	name: z.string().min(1),
	input: z.looseObject({
		file_path: z.string().optional(),
		command: z.string().optional(),
	}),
});

const transcriptRecordSchema = z.looseObject({
	type: z.string().optional(),
	message: z
		.looseObject({
			content: z.unknown().optional(),
		})
		.optional(),
});

const assistantRecordSchema = z.looseObject({
	type: z.literal("assistant"),
	message: z.looseObject({ content: z.array(z.unknown()) }),
});

const userRecordSchema = z.looseObject({
	type: z.literal("user"),
	message: z.looseObject({
		content: z.union([z.string(), z.array(z.unknown())]),
	}),
});

const toolResultSchema = z.looseObject({
	type: z.literal("tool_result"),
	tool_use_id: z.string().min(1).optional(),
	is_error: z.boolean().optional(),
});

const contentBlockSchema = z.looseObject({ type: z.string().min(1) });

const outputStyleAttachmentSchema = z.looseObject({
	type: z.literal("output_style"),
	style: z.string().min(1),
});

const attachmentRecordSchema = z.looseObject({
	type: z.literal("attachment"),
	attachment: z.unknown(),
});

const metaRecordSchema = z.looseObject({ isMeta: z.literal(true) });

const textBlockSchema = z.looseObject({
	type: z.literal("text"),
	text: z.string(),
});

/**
 * The provider opens a loaded skill's body with this line, in a user record it
 * marks as meta, whether a slash command or a Skill call loaded it, and a Skill
 * call it refuses gets no body, so this line rather than the call is the
 * evidence the skill loaded.
 */
const SKILL_BODY_OPENING =
	/^Base directory for this skill: (?<directory>[^\n]+)/u;

export type ToolUse = z.infer<typeof toolUseSchema>;

export const transcriptLocationSchema = z
	.object({
		line: z.number().int().positive(),
		block: z.number().int().positive(),
	})
	.strict();

export type TranscriptLocation = z.infer<typeof transcriptLocationSchema>;

const diagnosticIssueKindSchema = z.enum([
	"empty-measured-transcript",
	"invalid-json",
	"invalid-message-content",
	"unsupported-content-block",
	"invalid-tool-use",
	"invalid-tool-result",
	"missing-tool-use-id",
	"duplicate-tool-use-id",
	"missing-tool-result-id",
	"duplicate-tool-result",
	"unmatched-tool-result",
	"missing-tool-result",
	"invalid-bash-command",
]);

const diagnosticIssueSchema = z
	.object({
		kind: diagnosticIssueKindSchema,
		occurrences: z.number().int().positive(),
		locations: z.array(transcriptLocationSchema),
		locationsTruncated: z.boolean(),
	})
	.strict();

const observedToolUseCountsSchema = z
	.object({
		total: z.number().int().nonnegative(),
		byName: z.array(
			z
				.object({
					name: z.string().min(1),
					count: z.number().int().positive(),
				})
				.strict(),
		),
	})
	.strict();

const MAX_PREVIEW_CODE_UNITS = 160;

const toolErrorSchema = z
	.object({
		toolUseId: z.string().min(1).optional(),
		toolName: z.string().min(1).optional(),
		call: transcriptLocationSchema.optional(),
		result: transcriptLocationSchema,
	})
	.strict();

const repeatedBashCommandSchema = z
	.object({
		commandSha256: z
			.string()
			.regex(/^[0-9a-f]{64}$/u, "Invalid SHA-256 digest"),
		commandCharacters: z.number().int().nonnegative(),
		preview: z.string().max(MAX_PREVIEW_CODE_UNITS),
		previewTruncated: z.boolean(),
		occurrences: z
			.array(
				z
					.object({
						toolUseId: z.string().min(1),
						location: transcriptLocationSchema,
					})
					.strict(),
			)
			.min(2),
	})
	.strict();

const transcriptObservationFields = {
	prefixLinesExcluded: z.number().int().nonnegative(),
	sourceLineCount: z.number().int().nonnegative(),
	measuredLineCount: z.number().int().nonnegative(),
	toolUseOccurrences: observedToolUseCountsSchema,
	toolErrors: z.array(toolErrorSchema),
	repeatedBashCommands: z.array(repeatedBashCommandSchema),
};

export const transcriptDiagnosticsSchema = z
	.discriminatedUnion("state", [
		z
			.object({
				state: z.literal("complete"),
				...transcriptObservationFields,
				issues: z.array(diagnosticIssueSchema).length(0),
			})
			.strict(),
		z
			.object({
				state: z.literal("partial"),
				...transcriptObservationFields,
				issues: z.array(diagnosticIssueSchema).min(1),
			})
			.strict(),
		z
			.object({
				state: z.literal("unavailable"),
				prefixLinesExcluded: z.number().int().nonnegative(),
			})
			.strict(),
	])
	.superRefine((diagnostics, context) => {
		if (diagnostics.state === "unavailable") {
			return;
		}

		const namedTotal = diagnostics.toolUseOccurrences.byName.reduce(
			(total, tool) => total + tool.count,
			0,
		);
		if (namedTotal !== diagnostics.toolUseOccurrences.total) {
			context.addIssue({
				code: "custom",
				message: "Per-tool occurrence counts must sum to the total",
				path: ["toolUseOccurrences"],
			});
		}
		const names = diagnostics.toolUseOccurrences.byName.map(({ name }) => name);
		if (new Set(names).size !== names.length) {
			context.addIssue({
				code: "custom",
				message: "Per-tool occurrence names must be unique",
				path: ["toolUseOccurrences", "byName"],
			});
		}

		let previousGroup: TranscriptLocation | undefined;
		for (const [
			groupIndex,
			group,
		] of diagnostics.repeatedBashCommands.entries()) {
			const ids = group.occurrences.map(({ toolUseId }) => toolUseId);
			if (new Set(ids).size !== ids.length) {
				context.addIssue({
					code: "custom",
					message: "Repeated commands require distinct tool-use IDs",
					path: ["repeatedBashCommands", groupIndex, "occurrences"],
				});
			}

			for (let index = 1; index < group.occurrences.length; index += 1) {
				const previous = group.occurrences[index - 1];
				const current = group.occurrences[index];
				if (
					previous !== undefined &&
					current !== undefined &&
					!locationPrecedes(previous.location, current.location)
				) {
					context.addIssue({
						code: "custom",
						message: "Repeated-command occurrences must follow source order",
						path: ["repeatedBashCommands", groupIndex, "occurrences", index],
					});
				}
			}

			const first = group.occurrences[0]?.location;
			if (
				previousGroup !== undefined &&
				first !== undefined &&
				!locationPrecedes(previousGroup, first)
			) {
				context.addIssue({
					code: "custom",
					message: "Repeated-command groups must follow source order",
					path: ["repeatedBashCommands", groupIndex],
				});
			}
			previousGroup = first;
		}
	});

export type TranscriptDiagnostics = z.infer<typeof transcriptDiagnosticsSchema>;

function locationPrecedes(
	left: Readonly<TranscriptLocation>,
	right: Readonly<TranscriptLocation>,
): boolean {
	return (
		left.line < right.line ||
		(left.line === right.line && left.block < right.block)
	);
}

interface LocatedToolUse {
	readonly use: ToolUse;
	readonly toolUseId: string | undefined;
	readonly location: TranscriptLocation;
}

interface LocatedToolResult {
	readonly toolUseId: string | undefined;
	readonly isError: boolean;
	readonly location: TranscriptLocation;
}

interface LocatedToolIdentity {
	readonly toolUseId: string | undefined;
	readonly location: TranscriptLocation;
}

interface LocatedDiagnosticIssue {
	readonly kind: z.infer<typeof diagnosticIssueKindSchema>;
	readonly location: TranscriptLocation;
}

interface IdentifiedToolUse {
	readonly toolUseId: string;
	readonly location: TranscriptLocation;
}

interface DiagnosticGrouping<Entry extends Immutable<LocatedToolIdentity>> {
	readonly byId: ReadonlyMap<string, readonly Entry[]>;
	readonly issues: readonly LocatedDiagnosticIssue[];
}

type LocatedToolUseMap = ReadonlyMap<
	string,
	Immutable<readonly LocatedToolUse[]>
>;
type LocatedToolResultMap = ReadonlyMap<
	string,
	Immutable<readonly LocatedToolResult[]>
>;

interface RepeatedBashDiagnostics {
	readonly commands: z.infer<typeof repeatedBashCommandSchema>[];
	readonly issues: readonly LocatedDiagnosticIssue[];
}

export interface TranscriptLine {
	readonly line: number;
	readonly toolUses: readonly ToolUse[];
	readonly outputStyle: string | undefined;
	readonly instructionFiles: readonly string[];
	readonly skillDirectories: readonly string[];
	readonly locatedToolUses: readonly LocatedToolUse[];
	readonly locatedToolResults: readonly LocatedToolResult[];
	readonly diagnosticIssues: readonly LocatedDiagnosticIssue[];
}

function readOutputStyle(record: JsonValue): string | undefined {
	const attachmentRecord = attachmentRecordSchema.safeParse(record);
	if (!attachmentRecord.success) {
		return undefined;
	}

	const outputStyle = outputStyleAttachmentSchema.safeParse(
		attachmentRecord.data.attachment,
	);

	return outputStyle.success ? outputStyle.data.style : undefined;
}

function readSkillDirectories(blocks: readonly unknown[]): readonly string[] {
	return blocks
		.map((block) => textBlockSchema.safeParse(block))
		.filter((parsed) => parsed.success)
		.map(
			(parsed) =>
				SKILL_BODY_OPENING.exec(parsed.data.text)?.groups?.["directory"],
		)
		.filter((directory) => directory !== undefined);
}

function readInstructionFiles(record: JsonValue): readonly string[] {
	const instructions = instructionsAttachmentSchema.safeParse(record);

	return instructions.success
		? instructions.data.attachment.files.map((file) => file.path)
		: [];
}

const SUPPORTED_NON_TOOL_BLOCKS = new Set([
	"image",
	"redacted_thinking",
	"text",
	"thinking",
]);

function readLine(line: string, lineNumber: number): TranscriptLine {
	const parsed = readJson(line);
	if (parsed === undefined) {
		return emptyTranscriptLine(lineNumber, "invalid-json");
	}

	const record = transcriptRecordSchema.safeParse(parsed);
	if (!record.success) {
		return emptyTranscriptLine(lineNumber, "invalid-message-content");
	}

	let blocks: readonly unknown[] = [];
	if (record.data.type === "assistant") {
		const assistant = assistantRecordSchema.safeParse(parsed);
		if (!assistant.success) {
			return emptyTranscriptLine(lineNumber, "invalid-message-content");
		}
		blocks = assistant.data.message.content;
	} else if (record.data.type === "user") {
		const user = userRecordSchema.safeParse(parsed);
		if (!user.success) {
			return emptyTranscriptLine(lineNumber, "invalid-message-content");
		}
		blocks = Array.isArray(user.data.message.content)
			? user.data.message.content
			: [];
	} else if (record.data.message !== undefined) {
		return emptyTranscriptLine(lineNumber, "invalid-message-content");
	}
	const locatedToolUses: LocatedToolUse[] = [];
	const locatedToolResults: LocatedToolResult[] = [];
	const diagnosticIssues: LocatedDiagnosticIssue[] = [];

	for (const [index, block] of blocks.entries()) {
		const location = { line: lineNumber, block: index + 1 };
		const typed = contentBlockSchema.safeParse(block);
		if (!typed.success) {
			diagnosticIssues.push({
				kind: "unsupported-content-block",
				location,
			});
			continue;
		}

		if (typed.data.type === "tool_use") {
			const use = toolUseSchema.safeParse(block);
			if (use.success) {
				locatedToolUses.push({
					use: use.data,
					toolUseId: use.data.id,
					location,
				});
			} else {
				diagnosticIssues.push({ kind: "invalid-tool-use", location });
			}
			continue;
		}

		if (typed.data.type === "tool_result") {
			const result = toolResultSchema.safeParse(block);
			if (result.success) {
				locatedToolResults.push({
					toolUseId: result.data.tool_use_id,
					isError: result.data.is_error === true,
					location,
				});
			} else {
				diagnosticIssues.push({ kind: "invalid-tool-result", location });
			}
			continue;
		}

		if (!SUPPORTED_NON_TOOL_BLOCKS.has(typed.data.type)) {
			diagnosticIssues.push({
				kind: "unsupported-content-block",
				location,
			});
		}
	}

	return {
		line: lineNumber,
		toolUses: locatedToolUses.map(({ use }) => use),
		outputStyle: readOutputStyle(parsed),
		instructionFiles: readInstructionFiles(parsed),
		skillDirectories:
			record.data.type === "user" && metaRecordSchema.safeParse(parsed).success
				? readSkillDirectories(blocks)
				: [],
		locatedToolUses,
		locatedToolResults,
		diagnosticIssues,
	};
}

function emptyTranscriptLine(
	line: number,
	kind: LocatedDiagnosticIssue["kind"],
): TranscriptLine {
	return {
		line,
		toolUses: [],
		outputStyle: undefined,
		instructionFiles: [],
		skillDirectories: [],
		locatedToolUses: [],
		locatedToolResults: [],
		diagnosticIssues: [{ kind, location: { line, block: 1 } }],
	};
}

function readJson(line: string): JsonValue | undefined {
	try {
		const parsed = jsonValueSchema.safeParse(JSON.parse(line));

		return parsed.success ? parsed.data : undefined;
	} catch {
		return undefined;
	}
}

export function parseTranscript(text: string): readonly TranscriptLine[] {
	return text
		.split("\n")
		.map((line, index) => ({ line, lineNumber: index + 1 }))
		.filter(({ line }) => line.trim() !== "")
		.map(({ line, lineNumber }) => readLine(line, lineNumber));
}

/**
 * Transcripts run to several megabytes, and ACT-25's resumed cases carry real
 * ones, so a transcript on disk is read one line at a time rather than held as
 * a string. A transcript the provider never wrote reads as no records, which is
 * the same thing an empty one reads as.
 */
export async function parseTranscriptFile(
	path: string,
	observer: LineObserver = IGNORE_CARRY,
): Promise<readonly TranscriptLine[]> {
	if (!(await Bun.file(path).exists())) {
		return [];
	}

	const lines: TranscriptLine[] = [];
	let lineNumber = 0;
	for await (const line of fileLines(path, observer)) {
		lineNumber += 1;
		if (line.trim() !== "") {
			lines.push(readLine(line, lineNumber));
		}
	}

	return lines;
}

export interface TranscriptDiagnosticsInput {
	readonly lines: Immutable<readonly TranscriptLine[]>;
	readonly prefixLinesExcluded: number;
	readonly sourceAvailable: boolean;
}

const MAX_ISSUE_LOCATIONS = 20;

export function transcriptDiagnostics(
	input: Readonly<TranscriptDiagnosticsInput>,
): TranscriptDiagnostics {
	if (!input.sourceAvailable) {
		return {
			state: "unavailable",
			prefixLinesExcluded: input.prefixLinesExcluded,
		};
	}

	const sourceLineCount = input.lines.at(-1)?.line ?? 0;
	const measured = input.lines.slice(input.prefixLinesExcluded);
	const uses = measured.flatMap(({ locatedToolUses }) => locatedToolUses);
	const results = measured.flatMap(
		({ locatedToolResults }) => locatedToolResults,
	);
	const issues = measured.flatMap(({ diagnosticIssues }) => diagnosticIssues);
	if (measured.length === 0) {
		issues.push({
			kind: "empty-measured-transcript",
			location: {
				line: Math.max(1, input.prefixLinesExcluded + 1),
				block: 1,
			},
		});
	}

	const groupedUses = groupByToolUseId(
		uses,
		"missing-tool-use-id",
		"duplicate-tool-use-id",
	);
	const groupedResults = groupByToolUseId(
		results,
		"missing-tool-result-id",
		"duplicate-tool-result",
	);
	const joiningIssues = joinIssues(groupedUses.byId, groupedResults.byId);
	const repeated = repeatedBashCommands(uses, groupedUses.byId);
	issues.push(
		...groupedUses.issues,
		...groupedResults.issues,
		...joiningIssues,
		...repeated.issues,
	);

	const observations = {
		prefixLinesExcluded: input.prefixLinesExcluded,
		sourceLineCount,
		measuredLineCount: measured.length,
		toolUseOccurrences: countToolUses(uses),
		toolErrors: observedErrors(results, groupedUses.byId),
		repeatedBashCommands: repeated.commands,
		issues: summarizeIssues(issues),
	};

	return transcriptDiagnosticsSchema.parse({
		state: observations.issues.length === 0 ? "complete" : "partial",
		...observations,
	});
}

function groupByToolUseId<Entry extends Immutable<LocatedToolIdentity>>(
	entries: readonly Entry[],
	missingKind: LocatedDiagnosticIssue["kind"],
	duplicateKind: LocatedDiagnosticIssue["kind"],
): DiagnosticGrouping<Entry> {
	const grouped = new Map<string, Entry[]>();
	const issues: LocatedDiagnosticIssue[] = [];
	for (const entry of entries) {
		if (entry.toolUseId === undefined) {
			issues.push({ kind: missingKind, location: entry.location });
			continue;
		}

		const occurrences = grouped.get(entry.toolUseId) ?? [];
		occurrences.push(entry);
		grouped.set(entry.toolUseId, occurrences);
	}
	for (const occurrences of grouped.values()) {
		if (occurrences.length > 1) {
			issues.push(
				...occurrences.map(({ location }) => ({
					kind: duplicateKind,
					location,
				})),
			);
		}
	}

	return { byId: grouped, issues };
}

function joinIssues(
	usesById: LocatedToolUseMap,
	resultsById: LocatedToolResultMap,
): readonly LocatedDiagnosticIssue[] {
	const issues: LocatedDiagnosticIssue[] = [];
	for (const [id, uses] of usesById) {
		if (!resultsById.has(id)) {
			issues.push(
				...uses.map(({ location }) => ({
					kind: "missing-tool-result" as const,
					location,
				})),
			);
		}
	}
	for (const [id, results] of resultsById) {
		if (!usesById.has(id)) {
			issues.push(
				...results.map(({ location }) => ({
					kind: "unmatched-tool-result" as const,
					location,
				})),
			);
		}
	}

	return issues;
}

function countToolUses(
	uses: Immutable<readonly LocatedToolUse[]>,
): z.infer<typeof observedToolUseCountsSchema> {
	const byName = new Map<string, number>();
	for (const { use } of uses) {
		byName.set(use.name, (byName.get(use.name) ?? 0) + 1);
	}

	return {
		total: uses.length,
		byName: [...byName].map(([name, count]) => ({ name, count })),
	};
}

function observedErrors(
	results: Immutable<readonly LocatedToolResult[]>,
	usesById: LocatedToolUseMap,
): z.infer<typeof toolErrorSchema>[] {
	const errors: z.infer<typeof toolErrorSchema>[] = [];
	for (const result of results) {
		if (!result.isError) {
			continue;
		}

		const matches =
			result.toolUseId === undefined
				? []
				: (usesById.get(result.toolUseId) ?? []);
		const [match] = matches.length === 1 ? matches : [];
		const observed: z.infer<typeof toolErrorSchema> = {
			result: result.location,
		};
		if (result.toolUseId !== undefined) {
			observed.toolUseId = result.toolUseId;
		}
		if (match !== undefined) {
			observed.toolName = match.use.name;
			observed.call = match.location;
		}
		errors.push(observed);
	}

	return errors;
}

function repeatedBashCommands(
	uses: Immutable<readonly LocatedToolUse[]>,
	usesById: LocatedToolUseMap,
): RepeatedBashDiagnostics {
	const grouped = new Map<string, IdentifiedToolUse[]>();
	const issues: LocatedDiagnosticIssue[] = [];
	for (const use of uses) {
		if (use.use.name !== "Bash") {
			continue;
		}

		const { command } = use.use.input;
		if (command === undefined) {
			issues.push({ kind: "invalid-bash-command", location: use.location });
			continue;
		}

		const { toolUseId } = use;
		if (toolUseId === undefined || usesById.get(toolUseId)?.length !== 1) {
			continue;
		}

		const occurrences = grouped.get(command) ?? [];
		occurrences.push({ toolUseId, location: use.location });
		grouped.set(command, occurrences);
	}

	return {
		commands: [...grouped]
			.filter(([_command, occurrences]) => occurrences.length > 1)
			.map(([command, occurrences]) =>
				describeRepeatedCommand(command, occurrences),
			),
		issues,
	};
}

function describeRepeatedCommand(
	command: string,
	occurrences: Immutable<readonly IdentifiedToolUse[]>,
): z.infer<typeof repeatedBashCommandSchema> {
	let commandCharacters = 0;
	let preview = "";
	let previewComplete = true;
	for (const character of command) {
		commandCharacters += 1;
		if (
			!previewComplete ||
			preview.length + character.length > MAX_PREVIEW_CODE_UNITS
		) {
			previewComplete = false;
			continue;
		}
		preview += character;
	}

	return {
		commandSha256: new Bun.CryptoHasher("sha256").update(command).digest("hex"),
		commandCharacters,
		preview,
		previewTruncated: !previewComplete,
		occurrences: occurrences.map(({ toolUseId, location }) => ({
			toolUseId,
			location,
		})),
	};
}

function summarizeIssues(
	issues: Immutable<readonly LocatedDiagnosticIssue[]>,
): z.infer<typeof diagnosticIssueSchema>[] {
	const grouped = new Map<
		LocatedDiagnosticIssue["kind"],
		TranscriptLocation[]
	>();
	for (const issue of issues) {
		const locations = grouped.get(issue.kind) ?? [];
		locations.push(issue.location);
		grouped.set(issue.kind, locations);
	}

	return [...grouped].map(([kind, locations]) => ({
		kind,
		occurrences: locations.length,
		locations: locations.slice(0, MAX_ISSUE_LOCATIONS),
		locationsTruncated: locations.length > MAX_ISSUE_LOCATIONS,
	}));
}

export function toolUses(
	lines: Immutable<readonly TranscriptLine[]>,
): readonly ToolUse[] {
	return lines.flatMap((line) => [...line.toolUses]);
}

export function toolUsesExceptFailed(
	lines: Immutable<readonly TranscriptLine[]>,
): readonly ToolUse[] {
	const failed = new Set(
		lines
			.flatMap((line) => [...line.locatedToolResults])
			.filter((result) => result.isError)
			.map((result) => result.toolUseId)
			.filter((id) => id !== undefined),
	);

	return toolUses(lines).filter(
		(use) => use.id === undefined || !failed.has(use.id),
	);
}

export function filesRead(
	uses: Immutable<readonly ToolUse[]>,
): readonly string[] {
	return uses
		.filter((use) => use.name === "Read")
		.map((use) => use.input.file_path)
		.filter((path) => path !== undefined);
}

export function outputStyles(
	lines: Immutable<readonly TranscriptLine[]>,
): readonly string[] {
	return lines
		.map((line) => line.outputStyle)
		.filter((style) => style !== undefined);
}

export function instructionFiles(
	lines: Immutable<readonly TranscriptLine[]>,
): readonly string[] {
	return lines.flatMap((line) => [...line.instructionFiles]);
}

export function skillDirectories(
	lines: Immutable<readonly TranscriptLine[]>,
): readonly string[] {
	return lines.flatMap((line) => [...line.skillDirectories]);
}
