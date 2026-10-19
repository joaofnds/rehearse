import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import AttemptScorecardBuilder from "./attempt-scorecard-test-builder";
import ReplayAttemptRecordBuilder from "./replay-attempt-record-test-builder";
import { benchmarkRunPaths } from "./run-layout";
import type { TestResources } from "./test-support";

const LINEAGE = "lineage-1";
const FIXTURE_JSON_INDENT_SPACES = 2;
class AttemptFilesBuilder {
	readonly #prefix: string;
	public constructor(props: Partial<{ readonly prefix: string }> = {}) {
		this.#prefix = props.prefix ?? "rehearse-attempts-";
	}
	public async build(
		resources: Pick<TestResources, "track">,
	): Promise<ReturnType<typeof benchmarkRunPaths>> {
		const directory = await mkdtemp(join(tmpdir(), this.#prefix));
		resources.track(directory);
		const paths = benchmarkRunPaths(directory, "run1");
		await Bun.write(
			paths.stageFile("discuss"),
			`${JSON.stringify(new AttemptScorecardBuilder().build(), null, FIXTURE_JSON_INDENT_SPACES)}\n`,
		);
		await Bun.write(
			paths.replayRecordFile(LINEAGE, "2026-08-30T10:00:00.000Z"),
			`${JSON.stringify(new ReplayAttemptRecordBuilder().build(), null, FIXTURE_JSON_INDENT_SPACES)}\n`,
		);

		return paths;
	}
}
export default AttemptFilesBuilder;
