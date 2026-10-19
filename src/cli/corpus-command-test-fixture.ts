import { afterEach, beforeEach } from "bun:test";
import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { DirectoryCorpusRoot } from "#benchmark/corpus-file";
import { measureCorpusVersion } from "#benchmark/corpus-version";
import {
	RecordedRunsFixture,
	liveStageSettings,
} from "#benchmark/run-records-test-support";

interface EditedCorpusRecords {
	readonly fixture: RecordedRunsFixture;
	readonly previous: string;
}
class CorpusCommandFixture {
	public readonly scratch: string;
	public readonly runsDirectory: string;
	public readonly source: DirectoryCorpusRoot;
	public static forEachTest(): CorpusCommandFixture {
		const fixture = new CorpusCommandFixture();
		beforeEach(async () => {
			await fixture.setUp();
		});
		afterEach(async () => {
			await fixture.cleanUp();
		});
		return fixture;
	}
	public constructor() {
		this.scratch = join(tmpdir(), `rehearse-corpus-command-${randomUUID()}`);
		this.runsDirectory = join(this.scratch, "records");
		this.source = { kind: "directory", root: join(this.scratch, "corpus") };
	}
	public async setUp(): Promise<void> {
		await mkdir(this.scratch, { recursive: true });
		await mkdir(join(this.source.root, "output-styles"), { recursive: true });
		await writeFile(join(this.source.root, "CLAUDE.md"), "instructions\n");
		await writeFile(
			join(this.source.root, "output-styles", "brief.md"),
			"brief\n",
		);
	}
	public async cleanUp(): Promise<void> {
		await rm(this.scratch, { force: true, recursive: true });
	}
	public async measureThenEdit(
		edited = "edited\n",
	): Promise<readonly string[]> {
		const digests: string[] = [];
		await Array.fromAsync(["brief\n", edited], async (text) => {
			await writeFile(
				join(this.source.root, "output-styles", "brief.md"),
				text,
			);
			const measurement = await measureCorpusVersion(
				this.runsDirectory,
				this.source,
			);
			if (measurement.kind !== "version") {
				throw new Error(`expected a version, got ${measurement.refusal}`);
			}
			digests.push(measurement.digest);
		});
		return digests;
	}
	public async recordEditedBuildSkill(): Promise<EditedCorpusRecords> {
		await Promise.all([
			mkdir(join(this.source.root, "skills", "build"), { recursive: true }),
			mkdir(join(this.source.root, "skills", "discuss"), { recursive: true }),
		]);
		await Promise.all([
			writeFile(
				join(this.source.root, "skills", "build", "SKILL.md"),
				"build\n",
			),
			writeFile(
				join(this.source.root, "skills", "discuss", "SKILL.md"),
				"discuss\n",
			),
		]);
		const fixture = new RecordedRunsFixture(this.runsDirectory, {
			settingsFile: await liveStageSettings(),
		});
		await fixture.write();
		await fixture.corpus.recordCorpusFrom(this.source);
		const measured = await fixture.corpus.recordVersionFrom(this.source);
		const previous = measured.kind === "version" ? measured.digest : "";
		await writeFile(
			join(this.source.root, "skills", "build", "SKILL.md"),
			"build, edited\n",
		);
		return { fixture, previous };
	}
}

export { CorpusCommandFixture as default };
