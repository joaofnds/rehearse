import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { z } from "zod";

import { unhandled } from "./contracts";
import { writeWhole } from "./corpus-version";
import orderedJson from "./ordered-json";
import { comparisonDigests, comparisonReportPaths } from "./run-layout";
import type { ValidationFieldOrder } from "./validation-issue-order";
import orderedValidationIssues from "./validation-issue-order";

const BASELINE_CORPUS_SCHEMA_VERSION = 1;

const CONTROL_CORPUS_SCHEMA_VERSION = 2;

const MULTIPLE_GROUPS_BASELINE_SCHEMA_VERSION = 3;

/** Beside a comparison's report, how its baseline arm was derived. */
const BASELINE_RECORD_FILE = "baseline.json";

const groupIdSchema = z.string().nonempty();

const derivationKindSchema = z.enum(["derived", "armA"]);

const singleGroupArmsSchema = z
	.object({
		baseline: groupIdSchema,
		candidate: groupIdSchema,
		control: groupIdSchema,
	})
	.strict();

const groupIdsSchema = z.tuple([groupIdSchema]).rest(groupIdSchema).readonly();

const corpusDigestSchema = z.string().regex(/^[0-9a-f]{64}$/u);

/**
 * `arms` names each arm's groups by its harness role, in the order its
 * manifest names them, so arms.baseline is arm A and the derived arm is the
 * control, whose corpus `controlCorpus` names. A comparison that added
 * attempts to another names it in `extends`. Version 2 named one group per
 * arm, and version 1 also called the control corpus baselineCorpus, one word
 * for two arms; both are still read.
 */
const comparisonBaselineRecordSchema = z
	.object({
		arms: z
			.object({
				baseline: groupIdsSchema,
				candidate: groupIdsSchema,
				control: groupIdsSchema,
			})
			.strict()
			.readonly(),
		controlCorpus: corpusDigestSchema,
		extends: z
			.string()
			.regex(/^[0-9a-f]{64}$/u)
			.optional(),
		kind: derivationKindSchema,
		schemaVersion: z.literal(MULTIPLE_GROUPS_BASELINE_SCHEMA_VERSION),
		skillUnderTest: z.string().nonempty(),
	})
	.strict();

const singleGroupFields = {
	arms: singleGroupArmsSchema,
	kind: derivationKindSchema,
	skillUnderTest: z.string().nonempty(),
};

const recordedBaselineSchema = z.discriminatedUnion("schemaVersion", [
	comparisonBaselineRecordSchema,
	z
		.object({
			schemaVersion: z.literal(CONTROL_CORPUS_SCHEMA_VERSION),
			...singleGroupFields,
			controlCorpus: corpusDigestSchema,
		})
		.strict(),
	z
		.object({
			schemaVersion: z.literal(BASELINE_CORPUS_SCHEMA_VERSION),
			...singleGroupFields,
			baselineCorpus: corpusDigestSchema,
		})
		.strict(),
]);

const baselineFieldOrder: ValidationFieldOrder = {
	children: { arms: { fields: ["baseline", "candidate", "control"] } },
	fields: [
		"schemaVersion",
		"kind",
		"skillUnderTest",
		"arms",
		"controlCorpus",
		"baselineCorpus",
		"extends",
	],
};

type ComparisonBaselineRecord = Readonly<
	z.infer<typeof comparisonBaselineRecordSchema>
>;

/**
 * Where a comparison's baseline arm came from: derived from arm A, or arm A
 * run unchanged, by `compare attempts`; otherwise supplied by the manifest's
 * author, whose control corpus says nothing about a skill under test.
 */
type ComparisonBaselineArm =
	| {
			readonly kind: "derived" | "armA";
			readonly skillUnderTest: string;
	  }
	| { readonly kind: "supplied" }
	| { readonly kind: "unreadable"; readonly reason: string };

/** How `compare attempts` made a comparison, or why no record says so. */
type RecordedComparisonBaseline =
	| { readonly kind: "recorded"; readonly record: ComparisonBaselineRecord }
	| { readonly kind: "supplied" }
	| { readonly kind: "unreadable"; readonly reason: string };

function comparisonBaselineRecordFile(reportDirectory: string): string {
	return join(reportDirectory, BASELINE_RECORD_FILE);
}

/** Written whole, so a reader never takes a torn record for another kind. */
async function writeComparisonBaselineRecord(
	reportDirectory: string,
	record: Readonly<ComparisonBaselineRecord>,
): Promise<void> {
	await mkdir(reportDirectory, { recursive: true });
	const parsed = comparisonBaselineRecordSchema.parse(record);
	const json = JSON.stringify(parsed);
	const text = orderedJson({ json, order: baselineFieldOrder });
	await writeWhole(comparisonBaselineRecordFile(reportDirectory), `${text}\n`);
}

function currentRecord(
	record: Readonly<z.infer<typeof recordedBaselineSchema>>,
): ComparisonBaselineRecord {
	switch (record.schemaVersion) {
		case MULTIPLE_GROUPS_BASELINE_SCHEMA_VERSION: {
			return record;
		}
		case CONTROL_CORPUS_SCHEMA_VERSION: {
			return {
				...record,
				arms: {
					baseline: [record.arms.baseline],
					candidate: [record.arms.candidate],
					control: [record.arms.control],
				},
				schemaVersion: MULTIPLE_GROUPS_BASELINE_SCHEMA_VERSION,
			};
		}
		case BASELINE_CORPUS_SCHEMA_VERSION: {
			const { baselineCorpus, ...fields } = record;

			return {
				...fields,
				arms: {
					baseline: [record.arms.baseline],
					candidate: [record.arms.candidate],
					control: [record.arms.control],
				},
				controlCorpus: baselineCorpus,
				schemaVersion: MULTIPLE_GROUPS_BASELINE_SCHEMA_VERSION,
			};
		}
		default: {
			return unhandled(record, "baseline record version");
		}
	}
}

/**
 * A record that cannot be read says nothing about the baseline arm, so it
 * reads unreadable rather than hiding the report it sits beside.
 */
async function readComparisonBaselineRecord(
	reportDirectory: string,
): Promise<RecordedComparisonBaseline> {
	const file = Bun.file(comparisonBaselineRecordFile(reportDirectory));
	if (!(await file.exists())) {
		return { kind: "supplied" };
	}
	try {
		const recordedBaseline = recordedBaselineSchema.parse(
			JSON.parse(await file.text()),
		);
		return {
			kind: "recorded",
			record: currentRecord(recordedBaseline),
		};
	} catch (error) {
		if (!(error instanceof SyntaxError || error instanceof z.ZodError)) {
			throw error;
		}
		const message =
			error instanceof z.ZodError
				? new z.ZodError([
						...orderedValidationIssues({
							error,
							order: baselineFieldOrder,
						}),
					]).message
				: error.message;

		return {
			kind: "unreadable",
			reason: `${BASELINE_RECORD_FILE} is not a baseline record: ${message}`,
		};
	}
}

async function readComparisonBaselineArm(
	reportDirectory: string,
): Promise<ComparisonBaselineArm> {
	const recorded = await readComparisonBaselineRecord(reportDirectory);
	if (recorded.kind !== "recorded") {
		return recorded;
	}

	return {
		kind: recorded.record.kind,
		skillUnderTest: recorded.record.skillUnderTest,
	};
}

/**
 * Every saved comparison but those an extension replaced, since the
 * extension holds all of their attempts and more. A replaced comparison is
 * kept and still opens by its digest. An extension that stopped before
 * writing its report replaces nothing, since it holds no attempts to read.
 */
async function listedComparisonDigests(
	runsDirectory: string,
): Promise<readonly string[]> {
	const digests = await comparisonDigests(runsDirectory);
	const extended = new Set<string>();
	await Array.fromAsync(digests, async (digest) => {
		const { directory, reportFile } = comparisonReportPaths(
			runsDirectory,
			digest,
		);
		if (!(await Bun.file(reportFile).exists())) {
			return;
		}
		const recorded = await readComparisonBaselineRecord(directory);
		if (recorded.kind === "recorded" && recorded.record.extends !== undefined) {
			extended.add(recorded.record.extends);
		}
	});

	return digests.filter((digest) => !extended.has(digest));
}

export {
	comparisonBaselineRecordFile,
	comparisonBaselineRecordSchema,
	listedComparisonDigests,
	readComparisonBaselineArm,
	readComparisonBaselineRecord,
	writeComparisonBaselineRecord,
};
export type {
	ComparisonBaselineArm,
	ComparisonBaselineRecord,
	RecordedComparisonBaseline,
};
