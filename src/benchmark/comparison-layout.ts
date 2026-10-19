import { join } from "node:path";

import { directoryNames } from "./record-directory-entries";

interface ComparisonReportPaths {
	readonly directory: string;
	readonly reportFile: string;
}

function comparisonReportPaths(
	runsDirectory: string,
	manifestDigest: string,
): ComparisonReportPaths {
	const directory = join(runsDirectory, "comparisons", manifestDigest);

	return { directory, reportFile: join(directory, "report.json") };
}

async function comparisonDigests(
	runsDirectory: string,
): Promise<readonly string[]> {
	return await directoryNames(join(runsDirectory, "comparisons"));
}

export { comparisonDigests, comparisonReportPaths };
export type { ComparisonReportPaths };
