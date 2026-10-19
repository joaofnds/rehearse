import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ComparisonEvidenceFixture } from "#benchmark/comparison-evidence-test-support";
import { CONTROL_DIR } from "#benchmark/config";
import { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import { TestResources } from "#benchmark/test-support";
import type { CommandOutput } from "#cli/output";

interface OutputRecorder {
	readonly output: CommandOutput;
	readonly stdout: readonly string[];
	readonly stderr: readonly string[];
}

function recordOutput(): OutputRecorder {
	const stdout: string[] = [];
	const stderr: string[] = [];

	return {
		output: {
			stderr: (text) => {
				stderr.push(text);
			},
			stdout: (text) => {
				stdout.push(text);
			},
		},
		stderr,
		stdout,
	};
}

async function failureOf(work: Promise<unknown>): Promise<Error> {
	try {
		await work;
	} catch (error) {
		return error instanceof Error ? error : new Error(String(error));
	}

	throw new Error("Expected the command to fail");
}

class CliTestWorkspace {
	public static forEachTest(): Readonly<CliTestWorkspace> {
		return new CliTestWorkspace(TestResources.forEachTest());
	}
	public constructor(private readonly resources: Readonly<TestResources>) {}
	public track(...directories: readonly string[]): void {
		for (const directory of directories) {
			this.resources.track(directory);
		}
	}
	public async createDirectory(prefix: string): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), prefix));
		this.resources.track(directory);
		return directory;
	}
	public static async comparisonEvidenceAt(
		directory: string,
	): Promise<ComparisonEvidenceFixture> {
		const fixture = new ComparisonEvidenceFixture(directory);
		await fixture.write();
		return fixture;
	}

	public async comparisonEvidence(): Promise<ComparisonEvidenceFixture> {
		const directory = await this.createDirectory("rehearse-cli-compare-");
		const fixture = new ComparisonEvidenceFixture(directory);
		await fixture.write();
		return fixture;
	}

	public async recordFixtureUnderControl(
		prefix: string,
	): Promise<RecordedRunsFixture> {
		const root = await mkdtemp(join(CONTROL_DIR, prefix));
		this.resources.track(root);
		return new RecordedRunsFixture(root);
	}

	public async writtenRecords(): Promise<RecordedRunsFixture> {
		const root = await this.createDirectory("rehearse-records-");
		const fixture = new RecordedRunsFixture(root);
		await fixture.write();
		return fixture;
	}
}

export { CliTestWorkspace, failureOf, recordOutput };
export type { OutputRecorder };
