import { mkdir, symlink } from "node:fs/promises";
import { dirname, join } from "node:path";

import { digest } from "./comparison-evidence-record-test-fixtures";
import { comparisonReportPaths } from "./run-layout";

interface LinkedDestination {
	readonly reportFile: string;
	readonly runsDirectory: string;
	readonly symlinkTarget: string;
}

interface DestinationInputs {
	readonly manifestFile: string;
	readonly temporaryDirectory: string;
}

async function linkedReportDestination({
	manifestFile,
	temporaryDirectory,
}: DestinationInputs): Promise<LinkedDestination> {
	const runsDirectory = join(temporaryDirectory, "comparison-output");
	const manifestSha = digest(await Bun.file(manifestFile).text());
	const { reportFile } = comparisonReportPaths(runsDirectory, manifestSha);
	const symlinkTarget = join(temporaryDirectory, "outside-report.json");

	await mkdir(dirname(reportFile), { recursive: true });
	await Bun.write(symlinkTarget, "outside bytes\n");
	await symlink(symlinkTarget, reportFile);

	return { reportFile, runsDirectory, symlinkTarget };
}

export { linkedReportDestination as default };
