import { z } from "zod";

import {
	ShortExcludeAppendError,
	appendExcludePatterns,
	readExcludePatterns,
} from "./backlog-excludes-io";

const REQUEST_ARGUMENT_INDEX = 2;
const MODE_ARGUMENT_INDEX = 3;
const requestSchema = z
	.strictObject({
		excludePath: z.string(),
		missing: z.array(z.string()).nonempty().readonly(),
		snapshotPath: z.string(),
	})
	.readonly();
type ExcludeReaderRequest = z.infer<typeof requestSchema>;
const shortAppendRequestSchema = z
	.strictObject({
		excludePath: z.string(),
		missing: z.array(z.string()).nonempty().readonly(),
	})
	.readonly();
type ExcludeShortAppendRequest = z.infer<typeof shortAppendRequestSchema>;
const shortAppendReportSchema = z
	.strictObject({
		bytesWritten: z.number().int().nonnegative(),
		excludePath: z.string(),
		expectedBytes: z.number().int().positive(),
		message: z.string(),
		name: z.literal("ShortExcludeAppendError"),
	})
	.readonly();
type ExcludeShortAppendReport = z.infer<typeof shortAppendReportSchema>;

function parseShortAppendReport(output: string): ExcludeShortAppendReport {
	return shortAppendReportSchema.parse(JSON.parse(output));
}

async function reportShortAppend(
	request: ExcludeShortAppendRequest,
): Promise<void> {
	try {
		await appendExcludePatterns({
			...request,
			existing: await readExcludePatterns(request.excludePath),
		});
	} catch (error) {
		if (!(error instanceof ShortExcludeAppendError)) {
			throw error;
		}

		process.stdout.write(
			`${JSON.stringify({
				bytesWritten: error.bytesWritten,
				excludePath: error.excludePath,
				expectedBytes: error.expectedBytes,
				message: error.message,
				name: error.name,
			})}\n`,
		);
		return;
	}

	throw new Error("Expected the filesystem to return a short exclude append");
}

async function appendFromSnapshot(
	request: ExcludeReaderRequest,
): Promise<void> {
	const existing = await readExcludePatterns(request.excludePath);
	await Bun.write(request.snapshotPath, existing);

	process.stdout.write("ready\n");
	await Bun.stdin.text();

	await appendExcludePatterns({
		excludePath: request.excludePath,
		existing,
		missing: request.missing,
	});
}

async function runRequest(): Promise<void> {
	const mode = z
		.enum(["snapshot", "report-short-append"])
		.parse(Bun.argv[MODE_ARGUMENT_INDEX] ?? "snapshot");
	const request: unknown = JSON.parse(
		Bun.argv[REQUEST_ARGUMENT_INDEX] ?? "null",
	);
	if (mode === "report-short-append") {
		await reportShortAppend(shortAppendRequestSchema.parse(request));
		return;
	}

	await appendFromSnapshot(requestSchema.parse(request));
}

if (import.meta.main) {
	await runRequest();
}

export { parseShortAppendReport as default };
export type {
	ExcludeReaderRequest,
	ExcludeShortAppendReport,
	ExcludeShortAppendRequest,
};
