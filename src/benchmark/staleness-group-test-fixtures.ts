import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { CASES_DIRECTORY } from "./case";
import { CONTROL_DIR } from "./config";
import {
	RecordedRunsFixture,
	directorySource,
} from "./run-records-test-support";
import { StalenessTestFiles } from "./staleness-test-files";

class ConfirmationCorpusFixtures extends StalenessTestFiles {
	public async fixtureWithGroupFrom(
		corpus: string,
	): Promise<RecordedRunsFixture> {
		const fixture = new RecordedRunsFixture(
			await this.temporaryDirectory("rehearse-group-staleness-"),
		);
		await fixture.write();
		await fixture.confirmations.corpus.recordGroupFrom(directorySource(corpus));

		return fixture;
	}
	public async fixtureForSessionCorpus(
		corpusFiles: readonly string[],
	): Promise<RecordedRunsFixture> {
		const caseId = `group-staleness-${crypto.randomUUID()}`;
		const directory = join(CONTROL_DIR, CASES_DIRECTORY, caseId);

		this.own([directory]);
		await Bun.write(
			join(directory, "case.json"),
			JSON.stringify({
				checks: [{ kind: "word-band", max: 1 }],
				corpusFiles,
				id: caseId,
				kind: "session",
				model: "sonnet",
				prompt: "Reply OK",
				sessionBudgetUsd: 0.2,
				title: "Session group staleness",
				tools: [],
			}),
		);

		return new RecordedRunsFixture(
			await this.temporaryDirectory("rehearse-group-session-records-"),
			{ sessionCaseId: caseId },
		);
	}

	public async matchingSessionGroups(
		corpus: string,
		layoutPaths: readonly string[],
	): Promise<RecordedRunsFixture> {
		const fixture = await this.fixtureForSessionCorpus(layoutPaths);
		await Array.fromAsync(["a-group", "z-group"], async (groupId) => {
			await fixture.confirmations.corpus.recordSessionGroupFrom({
				corpusRoot: corpus,
				groupId,
				layoutPaths,
			});
		});

		return fixture;
	}

	public async sessionStyleCorpus(delivery: string): Promise<string> {
		const corpus = await this.temporaryDirectory("rehearse-group-style-");
		await mkdir(join(corpus, "output-styles"), { recursive: true });
		await mkdir(join(corpus, "skills", "delivery"), { recursive: true });
		await Bun.write(join(corpus, "output-styles", "brief.md"), "brief\n");
		await Bun.write(join(corpus, "skills", "delivery", "SKILL.md"), delivery);

		return corpus;
	}
	public async briefCorpus(prefix: string): Promise<string> {
		const corpus = await this.temporaryDirectory(prefix);
		await Bun.write(join(corpus, "output-styles/brief.md"), "brief\n");

		return corpus;
	}
	public async sharedCaseCorpus(): Promise<string> {
		const corpus = await this.briefCorpus("rehearse-group-shared-case-");
		await Bun.write(join(corpus, "skills/delivery/SKILL.md"), "delivery\n");

		return corpus;
	}
}

export { ConfirmationCorpusFixtures as default };
