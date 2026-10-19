import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { RecordedRunsFixture } from "./run-records-test-support";
import { StalenessTestFiles } from "./staleness-test-files";

class SessionCorpusFixtures extends StalenessTestFiles {
	public async styleCorpus(brief: string): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-case-corpus-"));
		this.own([root]);
		await mkdir(join(root, "output-styles"), { recursive: true });
		await Bun.write(join(root, "output-styles", "brief.md"), brief);

		return root;
	}
	public async runsWithSmokeAttempt(corpusRoot: string): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-case-stale-"));
		this.own([root]);
		const fixture = new RecordedRunsFixture(root);
		await fixture.sessions.writeAttemptReading({
			caseId: "smoke",
			corpusRoot,
			layoutPaths: ["output-styles/brief.md"],
		});

		return root;
	}
}

export { SessionCorpusFixtures as default };
