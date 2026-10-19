import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

import {
	NO_PROVIDER_PROJECTS,
	directorySource,
	fixedCorpusSource,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import createApiApp from "#server/api";
import { ApiTestWorkspace } from "#server/api-test-workspace";
import ComparisonDriver from "#server/comparison-test-driver";

class ComparisonHarness {
	private constructor(
		private readonly workspace: Readonly<ApiTestWorkspace>,
		public readonly runsDirectory: string,
		public readonly driver: Readonly<ComparisonDriver>,
	) {}
	public static async setup(): Promise<ComparisonHarness> {
		const workspace = new ApiTestWorkspace();
		const root = await workspace.emptyDirectory("rehearse-comparison-api-");
		const runsDirectory = join(root, "runs");
		const corpusRoot = await workspace.emptyDirectory(
			"rehearse-comparison-corpus-",
		);

		await mkdir(runsDirectory);

		const app = createApiApp({
			liveness: nothingRunning,
			projectsDirectory: NO_PROVIDER_PROJECTS,
			readCorpusSource: fixedCorpusSource(directorySource(corpusRoot)),
			runsDirectory,
		});

		return new ComparisonHarness(
			workspace,
			runsDirectory,
			new ComparisonDriver(app),
		);
	}
	public async reset(): Promise<void> {
		await rm(this.runsDirectory, { force: true, recursive: true });
		await mkdir(this.runsDirectory);
	}
	public async teardown(): Promise<void> {
		await this.workspace.dispose();
	}
}
export { ComparisonHarness as default };
