import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";

import {
	RecordedRunsFixture,
	directorySource,
	liveStageSettings,
} from "./run-records-test-support";
import { STYLE, styleEntry } from "./staleness-loaded-file-test-fixtures";
import {
	discussManifest,
	planningRubricNow,
} from "./staleness-rubric-test-fixtures";
import { StalenessTestFiles } from "./staleness-test-files";

class ReadManifestFixtures extends StalenessTestFiles {
	public async recordedFixture(): Promise<{
		readonly fixture: RecordedRunsFixture;
		readonly corpus: string;
	}> {
		const root = await this.temporaryDirectory("rehearse-manifest-staleness-");
		const fixture = new RecordedRunsFixture(root, {
			settingsFile: await liveStageSettings(),
		});
		await fixture.write();
		await fixture.pipeline.writeInitialCheckpoint();
		const corpus = await this.stageCorpus("rehearse-manifest-corpus-");
		await fixture.corpus.recordCorpusFrom(directorySource(corpus));
		await fixture.corpus.recordVersionFrom(directorySource(corpus));
		await fixture.corpus.recordReplayFrom(directorySource(corpus));

		return { corpus, fixture };
	}

	public async escapedStyleFixture(): Promise<{
		readonly fixture: RecordedRunsFixture;
		readonly corpus: string;
		readonly outside: string;
	}> {
		const { fixture, corpus } = await this.recordedFixture();
		const outside = await this.temporaryDirectory("rehearse-manifest-outside-");
		await Bun.write(join(outside, "SKILL.md"), "style\n");
		await mkdir(join(corpus, "skills", "delivery"), { recursive: true });
		await symlink(join(outside, "SKILL.md"), join(corpus, STYLE));
		await fixture.corpus.recordReadManifest("discuss", [
			...discussManifest(await planningRubricNow()),
			styleEntry("style\n"),
		]);
		return { corpus, fixture, outside };
	}
}

export { ReadManifestFixtures as default };
