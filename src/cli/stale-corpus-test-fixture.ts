import { mkdir, rm, symlink } from "node:fs/promises";
import { join } from "node:path";

import {
	RecordedRunsFixture,
	directorySource,
	liveStageSettings,
} from "#benchmark/run-records-test-support";
import { CliTestWorkspace } from "#cli/cli-test-support";

class StaleCorpusFixture {
	public static forEachTest(): StaleCorpusFixture {
		return new StaleCorpusFixture(CliTestWorkspace.forEachTest());
	}
	public constructor(private readonly workspace: Readonly<CliTestWorkspace>) {}
	public async temporaryDirectory(prefix: string): Promise<string> {
		return await this.workspace.createDirectory(prefix);
	}

	public async corpusDirectory(buildSkill: string): Promise<string> {
		const root = await this.temporaryDirectory("rehearse-stale-cli-corpus-");
		await Array.fromAsync(["build", "discuss", "doctrine"], async (skill) => {
			await mkdir(join(root, "skills", skill), { recursive: true });
			await Bun.write(
				join(root, "skills", skill, "SKILL.md"),
				skill === "build" ? buildSkill : `${skill} skill\n`,
			);
		});
		await mkdir(join(root, "output-styles"), { recursive: true });
		await Bun.write(join(root, "output-styles", "brief.md"), "brief style\n");
		await Bun.write(join(root, "CLAUDE.md"), "the instructions\n");

		return root;
	}

	public async fixtureRecordedAgainst(
		corpusRoot: string,
	): Promise<RecordedRunsFixture> {
		const root = await this.temporaryDirectory("rehearse-stale-cli-");
		const fixture = new RecordedRunsFixture(root, {
			settingsFile: await liveStageSettings(),
		});
		await fixture.write();
		await fixture.corpus.recordCorpusFrom(directorySource(corpusRoot));
		await fixture.corpus.recordReplayFrom(directorySource(corpusRoot));
		await fixture.confirmations.corpus.recordGroupFrom(
			directorySource(corpusRoot),
		);
		await fixture.sessions.writeAttemptReading({
			caseId: "smoke",
			corpusRoot,
			layoutPaths: ["output-styles/brief.md"],
		});

		return fixture;
	}
	public async escapeInstructions(corpus: string): Promise<string> {
		const outside = await this.temporaryDirectory(
			"rehearse-stale-cli-outside-",
		);
		await Bun.write(join(outside, "secret.md"), "SECRET BYTES\n");
		await rm(join(corpus, "CLAUDE.md"));
		await symlink(join(outside, "secret.md"), join(corpus, "CLAUDE.md"));
		return outside;
	}
}

export { StaleCorpusFixture as default };
