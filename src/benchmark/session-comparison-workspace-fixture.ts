import { afterEach, beforeEach } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { comparisonReportPaths } from "./run-layout";
import { firstRecordedSessionRep } from "./session-comparison-record-reader-fixture";
import { digest } from "./session-comparison-record-test-fixture";

function comparisonSuiteRoot(prefix = "rehearse-session-comparison-"): string {
	const root = join(tmpdir(), `${prefix}${randomUUID()}`);

	beforeEach(async () => {
		await mkdir(root, { recursive: true });
	});

	afterEach(async () => {
		await rm(root, { force: true, recursive: true });
	});

	return root;
}

interface OverlappingReportFixture {
	readonly manifestPath: string;
	readonly runsDirectory: string;
	readonly groupFile: string;
}

interface ReportOverlap {
	readonly reportPath: string;
	readonly attemptPath: string;
	readonly attemptText: string;
}

async function plantOverlappingReport({
	manifestPath,
	runsDirectory,
	groupFile,
}: OverlappingReportFixture): Promise<ReportOverlap> {
	const manifestSha = digest(await Bun.file(manifestPath).text());
	const reportPath = comparisonReportPaths(
		runsDirectory,
		manifestSha,
	).reportFile;
	const { attemptPath } = await firstRecordedSessionRep(groupFile);
	const attemptText = await Bun.file(attemptPath).text();

	await mkdir(dirname(reportPath), { recursive: true });

	await symlink(attemptPath, reportPath);

	return { attemptPath, attemptText, reportPath };
}

export { comparisonSuiteRoot, plantOverlappingReport };
