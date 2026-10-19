import { afterEach, beforeEach } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { ComparisonEvidenceFixture } from "./comparison-evidence-test-support";

interface ReportCleanup {
	writtenReportFile?: string | undefined;
}

interface ComparisonLoaderTest {
	readonly fixture: ComparisonEvidenceFixture;
	readonly temporaryDirectory: string;
	readonly trackReportFile: (path: string) => void;
}

function comparisonLoaderTestFixture(): ComparisonLoaderTest {
	const temporaryDirectory = join(
		tmpdir(),
		`rehearse-comparison-loader-${randomUUID()}`,
	);
	const fixture = new ComparisonEvidenceFixture(temporaryDirectory);
	const writtenReportFileCapture: ReportCleanup = {};

	function trackReportFile(path: string): void {
		writtenReportFileCapture.writtenReportFile = path;
	}

	beforeEach(async () => {
		await mkdir(temporaryDirectory, { recursive: true });
		await fixture.write();
	});

	afterEach(async () => {
		if (writtenReportFileCapture.writtenReportFile !== undefined) {
			await rm(dirname(writtenReportFileCapture.writtenReportFile), {
				force: true,
				recursive: true,
			});
		}

		await rm(temporaryDirectory, { force: true, recursive: true });
	});

	return { fixture, temporaryDirectory, trackReportFile };
}

export { comparisonLoaderTestFixture as default, type ComparisonLoaderTest };
