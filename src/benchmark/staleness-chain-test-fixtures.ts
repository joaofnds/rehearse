import { join } from "node:path";

import {
	RecordedRunsFixture,
	directorySource,
	liveStageSettings,
} from "./run-records-test-support";
import { StalenessTestFiles } from "./staleness-test-files";

class CheckpointChainFixtures extends StalenessTestFiles {
	public async editedFixture(): Promise<{
		readonly fixture: RecordedRunsFixture;
		readonly corpus: string;
	}> {
		const root = await this.temporaryDirectory("rehearse-staleness-");
		const fixture = new RecordedRunsFixture(root, {
			settingsFile: await liveStageSettings(),
		});
		await fixture.write();
		await fixture.pipeline.writeInitialCheckpoint();
		const corpus = await this.stageCorpus("rehearse-staleness-corpus-");
		await fixture.corpus.recordCorpusFrom(directorySource(corpus));
		await fixture.corpus.recordVersionFrom(directorySource(corpus));
		await Bun.write(join(corpus, "skills", "build", "SKILL.md"), "edited\n");

		return { corpus, fixture };
	}

	public async stoppedStageFixture(): Promise<{
		readonly fixture: RecordedRunsFixture;
		readonly corpus: string;
	}> {
		const root = await this.temporaryDirectory("rehearse-staleness-");
		const fixture = new RecordedRunsFixture(root, {
			settingsFile: await liveStageSettings(),
		});
		await fixture.stopped.writeStoppedRun();
		const corpus = await this.buildCorpus("rehearse-staleness-corpus-");
		await fixture.corpus.recordStoppedStageFrom(directorySource(corpus));
		return { corpus, fixture };
	}
}

export { CheckpointChainFixtures as default };
