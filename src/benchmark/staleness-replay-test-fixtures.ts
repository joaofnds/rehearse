import {
	RecordedRunsFixture,
	directorySource,
	liveStageSettings,
} from "./run-records-test-support";
import { StalenessTestFiles } from "./staleness-test-files";

class ReplayCorpusFixtures extends StalenessTestFiles {
	public async recordedFixture(): Promise<{
		readonly fixture: RecordedRunsFixture;
		readonly corpus: string;
	}> {
		const root = await this.temporaryDirectory("rehearse-replay-staleness-");
		const fixture = new RecordedRunsFixture(root, {
			settingsFile: await liveStageSettings(),
		});
		await fixture.write();
		await fixture.pipeline.writeInitialCheckpoint();
		const corpus = await this.stageCorpus("rehearse-replay-corpus-");
		await fixture.corpus.recordCorpusFrom(directorySource(corpus));
		await fixture.corpus.recordVersionFrom(directorySource(corpus));
		await fixture.corpus.recordReplayFrom(directorySource(corpus));

		return { corpus, fixture };
	}
}

export { ReplayCorpusFixtures as default };
