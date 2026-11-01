import { cp, lstat } from "node:fs/promises";
import { basename, join } from "node:path";

import type { SessionCase } from "./case";
import type { HashedFile } from "./checkpoint";
import type { SessionSettings } from "./claude";
import { frozenDirectoryFiles, writeFrozenFile } from "./confirmation-evidence";
import type { FrozenFile } from "./confirmation-evidence";
import type { ResolvedCorpusFile } from "./corpus-file";
import type { CorpusMeasurement } from "./corpus-measurement";
import { SymlinkedEntryError } from "./file-presence";
import type { SessionCorpusSnapshot } from "./session-corpus";

interface FrozenSessionInputs {
	readonly sessionCase: SessionCase;
	readonly settings: SessionSettings;
	readonly corpusSnapshot: SessionCorpusSnapshot;
	readonly corpusFiles: readonly ResolvedCorpusFile[];
	readonly corpusVersion: CorpusMeasurement;
	readonly versionFiles: readonly HashedFile[];
	readonly lineage: string;
	readonly files: readonly FrozenFile[];
}

interface SessionInputDirectories {
	readonly groupDirectory: string;
	readonly inputsDirectory: string;
}

const JSON_INDENTATION_SPACES = 2;
class SessionInputFiles {
	private readonly files: FrozenFile[] = [];
	public constructor(private readonly directories: SessionInputDirectories) {}
	public async record(
		sessionCase: SessionCase,
		corpusDirectory: string,
	): Promise<{
		readonly sessionCase: SessionCase;
		readonly files: readonly FrozenFile[];
	}> {
		this.files.push(
			await writeFrozenFile(this.directories.groupDirectory, {
				content: `${JSON.stringify(
					sessionCase.declaration,
					null,
					JSON_INDENTATION_SPACES,
				)}\n`,
				kind: "case",
				path: join(this.directories.inputsDirectory, "case.json"),
			}),
		);
		const fixturePath = await this.freezeFixture(sessionCase.fixturePath);
		const transcriptPath = await this.freezeTranscript(
			sessionCase.transcriptPath,
		);
		const { judge } = sessionCase;
		if (judge !== undefined) {
			this.files.push(
				await writeFrozenFile(this.directories.groupDirectory, {
					content: judge.rubric,
					kind: "rubric",
					path: join(this.directories.inputsDirectory, "rubric.md"),
				}),
			);
		}

		this.files.push(
			...(await frozenDirectoryFiles(
				this.directories.groupDirectory,
				corpusDirectory,
				"corpus",
			)),
		);

		return {
			files: this.files,
			sessionCase: { ...sessionCase, fixturePath, transcriptPath },
		};
	}
	private async freezeFixture(
		source: string | undefined,
	): Promise<string | undefined> {
		if (source === undefined) {
			return undefined;
		}

		const fixturePath = join(this.directories.inputsDirectory, "fixture");
		await cp(source, fixturePath, { recursive: true });
		this.files.push(
			...(await frozenDirectoryFiles(
				this.directories.groupDirectory,
				fixturePath,
				"fixture",
			)),
		);

		return fixturePath;
	}
	private async freezeTranscript(
		source: string | undefined,
	): Promise<string | undefined> {
		if (source === undefined) {
			return undefined;
		}

		const entry = await lstat(source);
		if (entry.isSymbolicLink()) {
			throw new SymlinkedEntryError(
				`Session transcript ${source} is a symlink; confirmation inputs must be files held by the case`,
			);
		}

		const transcriptPath = join(
			this.directories.inputsDirectory,
			"transcript",
			basename(source),
		);
		this.files.push(
			await writeFrozenFile(this.directories.groupDirectory, {
				content: await Bun.file(source).text(),
				kind: "transcript",
				path: transcriptPath,
			}),
		);

		return transcriptPath;
	}
}
export { SessionInputFiles as default };
export type { FrozenSessionInputs, SessionInputDirectories };
