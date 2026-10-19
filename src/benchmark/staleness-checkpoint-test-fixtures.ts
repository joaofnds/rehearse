import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { CASES_DIRECTORY } from "./case";
import { CONTROL_DIR } from "./config";
import {
	RecordedRunsFixture,
	directorySource,
	liveStageSettings,
} from "./run-records-test-support";
import { StalenessTestFiles } from "./staleness-test-files";

const SHA256_HEX_DIGITS = 64;

class CheckpointCorpusFixtures extends StalenessTestFiles {
	public async corpusDirectory(buildSkill: string): Promise<string> {
		const root = await this.temporaryDirectory("rehearse-stale-corpus-");
		await mkdir(join(root, "skills", "build"), { recursive: true });
		await mkdir(join(root, "skills", "discuss"), { recursive: true });
		await mkdir(join(root, "skills", "doctrine"), { recursive: true });
		await Bun.write(join(root, "CLAUDE.md"), "the instructions\n");
		await Bun.write(join(root, "skills", "build", "SKILL.md"), buildSkill);
		await Bun.write(
			join(root, "skills", "discuss", "SKILL.md"),
			"discuss skill\n",
		);
		await Bun.write(
			join(root, "skills", "doctrine", "principles.md"),
			"the doctrine\n",
		);

		return root;
	}
	public async writtenFixture(): Promise<RecordedRunsFixture> {
		const root = await this.temporaryDirectory("rehearse-stale-");
		const fixture = new RecordedRunsFixture(root, {
			settingsFile: await liveStageSettings(),
		});
		await fixture.write();
		await fixture.pipeline.writeInitialCheckpoint();

		return fixture;
	}
	public async declarePipelineCase(
		caseId: string,
		settingsContent?: string,
	): Promise<void> {
		const directory = join(CONTROL_DIR, CASES_DIRECTORY, caseId);
		this.own([directory]);
		await mkdir(directory, { recursive: true });
		await Bun.write(
			join(directory, "case.json"),
			JSON.stringify({
				finalRubric: "rubric.md",
				id: caseId,
				kind: "pipeline",
				pipeline: "pipeline.json",
				productBrief: "brief.md",
				rubrics: "rubrics",
				settingsFile: "settings.json",
				target: { path: "/target" },
				task: "task.md",
				title: "Settings probe",
			}),
		);
		if (settingsContent !== undefined) {
			await Bun.write(join(directory, "settings.json"), settingsContent);
		}
	}

	public async settingsRun({
		fixture,
		corpus,
		run,
		caseId,
		settingsContent,
	}: SettingsRunFixture): Promise<void> {
		await this.declarePipelineCase(caseId, settingsContent);
		await fixture.pipeline.writePipelineRun({
			caseId,
			run,
			settingsFile: {
				path: `cases/${caseId}/settings.json`,
				sha256: "0".repeat(SHA256_HEX_DIGITS),
			},
		});
		await fixture.corpus.recordCorpusFrom(directorySource(corpus));
		await fixture.corpus.recordCorpusFrom(directorySource(corpus), run);
	}
}

interface SettingsRunFixture {
	readonly fixture: RecordedRunsFixture;
	readonly corpus: string;
	readonly run: string;
	readonly caseId: string;
	readonly settingsContent?: string;
}

export { CheckpointCorpusFixtures as default };
