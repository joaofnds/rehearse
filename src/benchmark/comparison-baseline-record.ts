import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { unhandled } from "./contracts";
import { writeWhole } from "./corpus-version";

/** Beside a comparison's report, how its baseline arm was derived. */
const BASELINE_RECORD_FILE = "baseline.json";

const groupIdSchema = z.string().min(1);

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
export const comparisonBaselineRecordSchema = z
	.object({
		schemaVersion: z.literal(3),
		kind: derivationKindSchema,
		skillUnderTest: z.string().min(1),
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
	})
	.strict();

const singleGroupFields = {
	kind: derivationKindSchema,
	skillUnderTest: z.string().min(1),
	arms: singleGroupArmsSchema,
};

const recordedBaselineSchema = z.discriminatedUnion("schemaVersion", [
	comparisonBaselineRecordSchema,
	z
		.object({
			schemaVersion: z.literal(2),
			...singleGroupFields,
			controlCorpus: corpusDigestSchema,
		})
		.strict(),
	z
		.object({
			schemaVersion: z.literal(1),
			...singleGroupFields,
			baselineCorpus: corpusDigestSchema,
		})
		.strict(),
]);

export type ComparisonBaselineRecord = Readonly<
	z.infer<typeof comparisonBaselineRecordSchema>
>;

/**
 * Where a comparison's baseline arm came from: derived from arm A, or arm A
 * run unchanged, by `compare attempts`; otherwise supplied by the manifest's
 * author, whose control corpus says nothing about a skill under test.
 */
export type ComparisonBaselineArm =
	| {
			readonly kind: "derived" | "armA";
			readonly skillUnderTest: string;
	  }
	| { readonly kind: "supplied" }
	| { readonly kind: "unreadable"; readonly reason: string };

export function comparisonBaselineRecordFile(reportDirectory: string): string {
	return join(reportDirectory, BASELINE_RECORD_FILE);
}

/** Written whole, so a reader never takes a torn record for another kind. */
export async function writeComparisonBaselineRecord(
	reportDirectory: string,
	record: Readonly<ComparisonBaselineRecord>,
): Promise<void> {
	await mkdir(reportDirectory, { recursive: true });
	await writeWhole(
		comparisonBaselineRecordFile(reportDirectory),
		`${JSON.stringify(comparisonBaselineRecordSchema.parse(record), null, 2)}\n`,
	);
}

/** How `compare attempts` made a comparison, or why no record says so. */
export type RecordedComparisonBaseline =
	| { readonly kind: "recorded"; readonly record: ComparisonBaselineRecord }
	| { readonly kind: "supplied" }
	| { readonly kind: "unreadable"; readonly reason: string };

function currentRecord(
	record: Readonly<z.infer<typeof recordedBaselineSchema>>,
): ComparisonBaselineRecord {
	switch (record.schemaVersion) {
		case 3: {
			return record;
		}
		case 2: {
			return {
				...record,
				schemaVersion: 3,
				arms: {
					baseline: [record.arms.baseline],
					candidate: [record.arms.candidate],
					control: [record.arms.control],
				},
			};
		}
		case 1: {
			const { baselineCorpus, ...fields } = record;

			return {
				...fields,
				schemaVersion: 3,
				arms: {
					baseline: [record.arms.baseline],
					candidate: [record.arms.candidate],
					control: [record.arms.control],
				},
				controlCorpus: baselineCorpus,
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
export async function readComparisonBaselineRecord(
	reportDirectory: string,
): Promise<RecordedComparisonBaseline> {
	const file = Bun.file(comparisonBaselineRecordFile(reportDirectory));
	if (!(await file.exists())) {
		return { kind: "supplied" };
	}
	try {
		return {
			kind: "recorded",
			record: currentRecord(
				recordedBaselineSchema.parse(JSON.parse(await file.text())),
			),
		};
	} catch (error) {
		if (!(error instanceof SyntaxError || error instanceof z.ZodError)) {
			throw error;
		}

		return {
			kind: "unreadable",
			reason: `${BASELINE_RECORD_FILE} is not a baseline record: ${error.message}`,
		};
	}
}

export async function readComparisonBaselineArm(
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
