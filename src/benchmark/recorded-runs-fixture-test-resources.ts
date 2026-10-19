import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { HashedFile } from "./checkpoint";
import { currentStageSettingsReference } from "./current-stage-settings";
import { RecordedRunsFixture } from "./run-records-test-support";
import type { RecordedRunsOptions } from "./run-records-test-support";
import { loadStageSettings } from "./stage-settings";

const RESOURCE_DRAIN_START_INDEX = 0;
class RecordedRunsTestResources {
	private readonly roots: string[] = [];
	public static readonly productionSettings = async (): Promise<HashedFile> => {
		const reference = await currentStageSettingsReference("audit-log");
		const selected = await loadStageSettings(reference.sourcePath);

		return selected.hashed;
	};
	public readonly fixture = async (
		options: RecordedRunsOptions = {},
	): Promise<RecordedRunsFixture> => {
		const root = await mkdtemp(join(tmpdir(), "rehearse-records-"));
		this.roots.push(root);

		return new RecordedRunsFixture(root, options);
	};
	public readonly cleanup = async (): Promise<void> => {
		await Promise.all(
			this.roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
				await rm(root, { force: true, recursive: true });
			}),
		);
	};
}
export { RecordedRunsTestResources as default };
