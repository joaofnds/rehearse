import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { digest } from "./comparison-evidence-record-test-fixtures";
import { comparisonReportPaths } from "./run-layout";

interface OutputDirectory {
	readonly name: string;
	readonly root: string;
}

interface ReportInputs {
	readonly manifestFile: string;
	readonly runsDirectory: string;
}

interface ReportLocation {
	readonly manifestSha: string;
	readonly reportFile: string;
}

async function comparisonOutputDirectory({
	name,
	root,
}: OutputDirectory): Promise<string> {
	const directory = join(root, name);

	await mkdir(directory);

	return directory;
}

async function comparisonReportLocation({
	manifestFile,
	runsDirectory,
}: ReportInputs): Promise<ReportLocation> {
	const manifestSha = digest(await Bun.file(manifestFile).text());
	const { reportFile } = comparisonReportPaths(runsDirectory, manifestSha);

	return { manifestSha, reportFile };
}

export { comparisonOutputDirectory, comparisonReportLocation };
