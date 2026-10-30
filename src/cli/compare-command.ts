import writeComparisonReport from "#benchmark/comparison-command";
import { UsageError } from "#cli/command-usage";
import type { CommandOutput } from "#cli/output";
import { writeRecord } from "#cli/output";

interface CompareRequest {
	readonly manifestPath: string | undefined;
	readonly runsDirectory: string;
	readonly json: boolean;
}

async function runCompare(
	request: CompareRequest,
	output: CommandOutput,
): Promise<void> {
	const { manifestPath } = request;
	if (manifestPath === undefined) {
		throw new UsageError(
			"Provide the comparison manifest: rehearse compare <comparison-manifest.json>",
		);
	}

	const reportFile = await writeComparisonReport({
		manifestPath,
		notice: (line) => {
			output.stderr(`${line}\n`);
		},
		runsDirectory: request.runsDirectory,
	});

	await writeRecord(output, reportFile, request.json);
}

export { runCompare as default };
export type { CompareRequest };
