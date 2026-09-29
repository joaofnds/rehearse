import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { writeWhole } from "./corpus-version";

/** Beside a comparison's report, how its baseline arm was derived. */
const BASELINE_RECORD_FILE = "baseline.json";

const groupIdSchema = z.string().min(1);

const derivationFields = {
	kind: z.enum(["derived", "armA"]),
	skillUnderTest: z.string().min(1),
	arms: z
		.object({
			baseline: groupIdSchema,
			candidate: groupIdSchema,
			control: groupIdSchema,
		})
		.strict(),
};

const corpusDigestSchema = z.string().regex(/^[0-9a-f]{64}$/u);

/**
 * `arms` names each group by its harness role, so arms.baseline is arm A and
 * the derived arm is the control, whose corpus `controlCorpus` names. Version
 * 1 called that corpus baselineCorpus, one word for two arms, and is still
 * read.
 */
export const comparisonBaselineRecordSchema = z
	.object({
		schemaVersion: z.literal(2),
		...derivationFields,
		controlCorpus: corpusDigestSchema,
	})
	.strict();

const recordedBaselineSchema = z.discriminatedUnion("schemaVersion", [
	comparisonBaselineRecordSchema,
	z
		.object({
			schemaVersion: z.literal(1),
			...derivationFields,
			baselineCorpus: corpusDigestSchema,
		})
		.strict(),
]);

export type ComparisonBaselineRecord = z.infer<
	typeof comparisonBaselineRecordSchema
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

/**
 * A record that cannot be read says nothing about the baseline arm, so it
 * reads unreadable rather than hiding the report it sits beside.
 */
export async function readComparisonBaselineArm(
	reportDirectory: string,
): Promise<ComparisonBaselineArm> {
	const file = Bun.file(comparisonBaselineRecordFile(reportDirectory));
	if (!(await file.exists())) {
		return { kind: "supplied" };
	}
	try {
		const record = recordedBaselineSchema.parse(JSON.parse(await file.text()));

		return { kind: record.kind, skillUnderTest: record.skillUnderTest };
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
