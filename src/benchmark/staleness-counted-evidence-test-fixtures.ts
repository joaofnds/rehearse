import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	RecordedRunsFixture,
	directorySource,
	liveStageSettings,
} from "./run-records-test-support";
import seedPipelineCorpus from "./staleness-pipeline-corpus-test-fixtures";

interface TrackedDirectoryOwner {
	readonly track: (directory: string) => void;
}

class CountedStalenessEvidence {
	public constructor(private readonly resources: TrackedDirectoryOwner) {}
	public async capture(): Promise<{
		readonly fixture: RecordedRunsFixture;
		readonly corpus: string;
	}> {
		const fixture = new RecordedRunsFixture(
			await this.directory("rehearse-every-staleness-"),
			{ settingsFile: await liveStageSettings() },
		);
		await fixture.write();
		await fixture.pipeline.writeInitialCheckpoint();
		const corpus = await this.corpus();
		await fixture.corpus.recordCorpusFrom(directorySource(corpus));
		await fixture.corpus.recordVersionFrom(directorySource(corpus));
		await fixture.corpus.recordReplayFrom(directorySource(corpus));
		return { corpus, fixture };
	}
	private async corpus(): Promise<string> {
		const corpus = await this.directory("rehearse-every-corpus-");
		await seedPipelineCorpus(corpus);
		return corpus;
	}
	private async directory(prefix: string): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), prefix));
		this.resources.track(directory);
		return directory;
	}
}
export { CountedStalenessEvidence as default };
