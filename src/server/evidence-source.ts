import { basename } from "node:path";
import { z } from "zod";
import { displayPath } from "#benchmark/config";
import type {
	EvidenceLocator,
	LocalCheckResult,
	RecordedStageEvidence,
	StageExchange,
} from "#benchmark/contracts";
import {
	contextFileSchema,
	localCheckResultSchema,
	recordedStageEvidenceSchema,
	stageJudgeInputSchema,
	unhandled,
} from "#benchmark/contracts";
import type { CitedFile, Span } from "#benchmark/evidence-locator";
import {
	findSpan,
	spanInCommitSubjects,
	spanInDiff,
} from "#benchmark/evidence-locator";
import { benchmarkRunPaths, runStageFiles } from "#benchmark/run-layout";
import { stageTextFiles } from "#benchmark/stage-grading";
import { UsageError } from "#cli/commands";
import { parseRunRecordId } from "#cli/record-id";
import { redactedFilePath } from "./redact-path";

/**
 * Opens the source a judge's evidence item cites, as the run's records hold
 * it. A request names a run record, a judge and an evidence item, never a
 * path: the run id is parsed as a record id, the stage is matched against the
 * stage records the run wrote, and every text returned comes from the record,
 * so no string a judge wrote reaches the filesystem.
 */

export type EvidenceJudge =
	| { readonly kind: "stage"; readonly stage: string }
	| { readonly kind: "final" };

export interface EvidenceRequest {
	readonly runsDirectory: string;
	readonly run: string;
	readonly judge: EvidenceJudge;
	readonly section: string;
	readonly item: string;
	readonly index: string;
}

export type SourceView =
	| {
			readonly kind: "text";
			readonly label: string;
			readonly text: string;
			readonly span?: Span;
	  }
	| {
			readonly kind: "harness";
			readonly result: "checkIntegrity" | "localChecks";
			readonly recorded: boolean;
			readonly value?: LocalCheckResult;
	  }
	| {
			readonly kind: "harness";
			readonly result: "harnessFailure";
			readonly recorded: boolean;
			readonly value?: string;
	  }
	| { readonly kind: "absent" }
	| { readonly kind: "before-quoted-spans" };

export interface EvidenceSource {
	/** The record file, relative to the repository. */
	readonly record: string;
	readonly source: string;
	readonly path: string;
	readonly claim: string;
	readonly quote?: string;
	readonly view: SourceView;
}

export class EvidenceSourceError extends Error {
	public override name = "EvidenceSourceError";

	public constructor(
		public readonly kind: "not-found" | "refused",
		message: string,
	) {
		super(message);
	}
}

interface RecordedSources {
	readonly texts: (
		source: RecordedStageEvidence["source"],
	) => readonly CitedFile[];
	readonly diff: string | undefined;
	readonly commitSubjects: readonly string[] | undefined;
	readonly exchanges: readonly StageExchange[];
	readonly harness: {
		readonly checkIntegrity?: LocalCheckResult;
		readonly localChecks?: LocalCheckResult;
		readonly harnessFailure?: string;
	};
}

interface JudgedItems {
	readonly sections: Readonly<Record<string, readonly JudgedItem[]>>;
	readonly sources: RecordedSources;
}

const judgedItemSchema = z.looseObject({
	id: z.string(),
	evidence: z.array(recordedStageEvidenceSchema),
});

const stageRecordSchema = z.looseObject({
	grade: z.looseObject({
		hardBlockers: z.array(judgedItemSchema),
		requirements: z.array(judgedItemSchema),
		dimensions: z.array(judgedItemSchema),
	}),
	input: stageJudgeInputSchema,
});

const finalRecordSchema = z.looseObject({
	grade: z.looseObject({ requirements: z.array(judgedItemSchema) }),
	diff: z.string(),
	baselineContext: z.array(contextFileSchema),
	checkIntegrity: localCheckResultSchema,
	localChecks: localCheckResultSchema,
});

type JudgedItem = z.infer<typeof judgedItemSchema>;

function notFound(message: string): EvidenceSourceError {
	return new EvidenceSourceError("not-found", message);
}

function stageItems(text: string): JudgedItems | undefined {
	const parsed = stageRecordSchema.safeParse(JSON.parse(text));
	if (!parsed.success) {
		return undefined;
	}
	const { grade, input } = parsed.data;

	return {
		sections: {
			hardBlockers: grade.hardBlockers,
			requirements: grade.requirements,
			dimensions: grade.dimensions,
		},
		sources: {
			texts: (source) => stageTextFiles(source, input),
			diff: input.diff,
			commitSubjects: input.commitSubjects,
			exchanges: input.transcript.exchanges,
			harness: {
				...(input.checkIntegrity && { checkIntegrity: input.checkIntegrity }),
				...(input.localChecks && { localChecks: input.localChecks }),
				...(input.harnessFailure !== undefined && {
					harnessFailure: input.harnessFailure,
				}),
			},
		},
	};
}

function finalItems(text: string): JudgedItems | undefined {
	const parsed = finalRecordSchema.safeParse(JSON.parse(text));
	if (!parsed.success) {
		return undefined;
	}
	const record = parsed.data;

	return {
		sections: { requirements: record.grade.requirements },
		sources: {
			texts: (source) =>
				source === "baseline-context"
					? record.baselineContext.map(({ path, content }) => ({
							file: path,
							text: content,
						}))
					: [],
			diff: record.diff,
			commitSubjects: undefined,
			exchanges: [],
			harness: {
				checkIntegrity: record.checkIntegrity,
				localChecks: record.localChecks,
			},
		},
	};
}

/**
 * The record file the judge wrote into. A stage is found among the stage
 * records the run wrote by comparing names, never by joining it into a path.
 */
async function judgeRecordFile(
	runsDirectory: string,
	run: string,
	judge: EvidenceJudge,
): Promise<string | undefined> {
	switch (judge.kind) {
		case "final": {
			const file = benchmarkRunPaths(runsDirectory, run).artifactFile;

			return (await Bun.file(file).exists()) ? file : undefined;
		}
		case "stage": {
			const files = await runStageFiles(runsDirectory, run);

			return files.find(
				(file) => basename(file) === `${run}.${judge.stage}.json`,
			);
		}
		default: {
			return unhandled(judge, "evidence judge");
		}
	}
}

function textView(
	label: string,
	text: string,
	span: Span | undefined,
): SourceView {
	return span === undefined
		? { kind: "text", label, text }
		: { kind: "text", label, text, span };
}

function commitSubjectView(
	subjects: readonly string[],
	index: number,
	quote: string | undefined,
): SourceView {
	if (subjects[index] === undefined) {
		throw notFound(`The record holds no commit subject ${String(index + 1)}`);
	}

	return textView(
		`commit subject ${String(index + 1)}`,
		subjects.join("\n"),
		quote === undefined
			? undefined
			: spanInCommitSubjects(quote, subjects, index),
	);
}

function harnessView(
	{ result, recorded }: Extract<EvidenceLocator, { kind: "harness" }>,
	harness: RecordedSources["harness"],
): SourceView {
	if (result === "harnessFailure") {
		const value = harness.harnessFailure;

		return value === undefined
			? { kind: "harness", result, recorded }
			: { kind: "harness", result, recorded, value };
	}
	const value = harness[result];

	return value === undefined
		? { kind: "harness", result, recorded }
		: { kind: "harness", result, recorded, value };
}

function sourceView(
	evidence: RecordedStageEvidence,
	sources: RecordedSources,
): SourceView {
	const { locator, quote } = evidence;
	if (locator === undefined) {
		return { kind: "before-quoted-spans" };
	}

	switch (locator.kind) {
		case "lines": {
			const file = sources
				.texts(evidence.source)
				.find(({ file: name }) => name === locator.file);
			if (file === undefined) {
				throw notFound(
					`The record holds no ${locator.file} for ${evidence.source}`,
				);
			}

			return textView(
				locator.file,
				file.text,
				quote === undefined ? undefined : findSpan(file.text, quote),
			);
		}
		case "hunk": {
			const diff = sources.diff ?? "";

			return textView(
				`${locator.file} ${locator.hunk}`,
				diff,
				quote === undefined ? undefined : spanInDiff(quote, diff, locator),
			);
		}
		case "commit-subject": {
			return commitSubjectView(
				sources.commitSubjects ?? [],
				locator.index,
				quote,
			);
		}
		case "exchange": {
			const exchange = sources.exchanges[locator.exchange];
			const text =
				locator.field === "message"
					? exchange?.agent.message
					: exchange?.productOwnerAnswer;
			if (text === undefined) {
				throw notFound(
					`The record holds no ${locator.field} in exchange ${String(locator.exchange + 1)}`,
				);
			}

			return textView(
				`exchange ${String(locator.exchange + 1)} ${locator.field}`,
				text,
				{ start: locator.start, end: locator.end },
			);
		}
		case "harness": {
			return harnessView(locator, sources.harness);
		}
		case "absent": {
			return { kind: "absent" };
		}
		default: {
			return unhandled(locator, "evidence locator");
		}
	}
}

function runName(run: string): string {
	try {
		return parseRunRecordId(run).run;
	} catch (error) {
		if (error instanceof UsageError) {
			throw new EvidenceSourceError("refused", error.message);
		}

		throw error;
	}
}

export async function readEvidenceSource(
	request: EvidenceRequest,
): Promise<EvidenceSource> {
	const run = runName(request.run);
	const file = await judgeRecordFile(request.runsDirectory, run, request.judge);
	if (file === undefined) {
		throw notFound(`Run ${run} recorded no such judge`);
	}

	const text = await Bun.file(file).text();
	const judged =
		request.judge.kind === "final" ? finalItems(text) : stageItems(text);
	const item = Object.hasOwn(judged?.sections ?? {}, request.section)
		? judged?.sections[request.section]?.find(({ id }) => id === request.item)
		: undefined;
	const index = /^\d+$/u.test(request.index) ? Number(request.index) : -1;
	const evidence = item?.evidence[index];
	if (judged === undefined || evidence === undefined) {
		throw notFound(
			`Run ${run} recorded no evidence ${request.index} for ${request.section} ${request.item}`,
		);
	}

	return {
		record: redactedFilePath(displayPath(file)),
		source: evidence.source,
		path: evidence.path,
		claim: evidence.claim,
		...(evidence.quote !== undefined && { quote: evidence.quote }),
		view: sourceView(evidence, judged.sources),
	};
}
