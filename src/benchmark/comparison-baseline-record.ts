import { join } from "node:path";
import { z } from "zod";

/** Beside a comparison's report, how its baseline arm was derived. */
const BASELINE_RECORD_FILE = "baseline.json";

const groupIdSchema = z.string().min(1);

export const comparisonBaselineRecordSchema = z
	.object({
		schemaVersion: z.literal(1),
		kind: z.enum(["derived", "armA"]),
		skillUnderTest: z.string().min(1),
		arms: z
			.object({
				baseline: groupIdSchema,
				candidate: groupIdSchema,
				control: groupIdSchema,
			})
			.strict(),
		baselineCorpus: z.string().regex(/^[0-9a-f]{64}$/u),
	})
	.strict();

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
	| { readonly kind: "supplied" };

export function comparisonBaselineRecordFile(reportDirectory: string): string {
	return join(reportDirectory, BASELINE_RECORD_FILE);
}

export async function writeComparisonBaselineRecord(
	reportDirectory: string,
	record: Readonly<ComparisonBaselineRecord>,
): Promise<void> {
	await Bun.write(
		comparisonBaselineRecordFile(reportDirectory),
		`${JSON.stringify(comparisonBaselineRecordSchema.parse(record), null, 2)}\n`,
	);
}

export async function readComparisonBaselineArm(
	reportDirectory: string,
): Promise<ComparisonBaselineArm> {
	const file = Bun.file(comparisonBaselineRecordFile(reportDirectory));
	if (!(await file.exists())) {
		return { kind: "supplied" };
	}
	const record = comparisonBaselineRecordSchema.parse(
		JSON.parse(await file.text()),
	);

	return { kind: record.kind, skillUnderTest: record.skillUnderTest };
}
