import { writeRunManifest } from "./manifest";
import ReconciliationManifestBuilder from "./reconciliation-manifest-test-builder";
import { benchmarkRunPaths } from "./run-layout";
import { assertSourceReady, claimTarget } from "./target";
import type { TestResources } from "./test-support";

class ReconciliationWorkspace {
	readonly #resources: Readonly<
		Pick<TestResources, "createTemporaryDirectory" | "createRepository">
	>;
	public constructor(
		resources: Readonly<
			Pick<TestResources, "createTemporaryDirectory" | "createRepository">
		>,
	) {
		this.#resources = resources;
	}
	public async claimedRun(): Promise<string> {
		const runsDirectory = await this.#resources.createTemporaryDirectory(
			"rehearse-reconciliation-",
		);
		const repository = await this.#resources.createRepository();
		const source = await assertSourceReady(repository.directory);

		await claimTarget(source, "run-1");

		const paths = benchmarkRunPaths(runsDirectory, "run-1");
		await writeRunManifest(
			paths.manifestFile,
			new ReconciliationManifestBuilder({ sourceRoot: source.root }).build(),
		);

		return runsDirectory;
	}
}
export { ReconciliationWorkspace as default };
