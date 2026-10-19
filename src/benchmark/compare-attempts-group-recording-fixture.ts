import { randomUUID } from "node:crypto";
import { cp, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";

import { freezeRubric } from "./compare-attempts-evidence-test-fixtures";
import type { ConfirmationMode } from "./confirmation-record";
import { confirmationGroupRecordSchema } from "./confirmation-record";
import { measureCorpusVersion } from "./corpus-version";
import { confirmationGroupPaths } from "./run-layout";
import { claimShortId } from "./short-id";

interface RecordedGroupWorkspace {
	readonly runsDirectory: string;
	readonly scratchDirectory: string;
	readonly rubric: string;
	readonly caseId: string;
}

const FIXTURE_JSON_INDENT_SPACES = 2;

interface Checkpoint {
	readonly run: string;
	readonly stage: string;
}

type CorpusFiles = Readonly<Record<string, string>>;

interface Recording {
	readonly corpus?: CorpusFiles;
	readonly source?: Checkpoint;
	readonly mode?: ConfirmationMode;
}

interface RecordedGroupCopy {
	readonly groupId: string;
	readonly fixtureGroupFile: string;
	readonly recording: Recording;
}

class RecordedComparisonGroupWriter {
	public constructor(private readonly workspace: RecordedGroupWorkspace) {}
	public async copyGroup({
		groupId,
		fixtureGroupFile,
		recording,
	}: RecordedGroupCopy): Promise<void> {
		const paths = confirmationGroupPaths(this.workspace.runsDirectory, groupId);
		await mkdir(dirname(paths.directory), { recursive: true });
		await cp(dirname(fixtureGroupFile), paths.directory, {
			recursive: true,
		});
		const group = confirmationGroupRecordSchema.parse(
			JSON.parse(await Bun.file(paths.groupFile).text()),
		);
		const corpusVersion =
			recording.corpus === undefined
				? undefined
				: await this.measure(recording.corpus);
		await Bun.write(
			paths.groupFile,
			`${JSON.stringify(
				{
					...group,
					inputs: { ...group.inputs, corpusVersion },
					mode: recording.mode ?? group.mode,
				},
				null,
				FIXTURE_JSON_INDENT_SPACES,
			)}\n`,
		);
		await freezeRubric({
			content: this.workspace.rubric,
			groupId,
			runsDirectory: this.workspace.runsDirectory,
		});
		await claimShortId(
			this.workspace.runsDirectory,
			this.workspace.caseId,
			recording.source === undefined
				? { groupId, kind: "group" }
				: { groupId, kind: "group", source: recording.source },
		);
	}
	private async measure(
		corpus: CorpusFiles,
	): Promise<{ readonly kind: "version"; readonly digest: string }> {
		const root = join(this.workspace.scratchDirectory, "corpora", randomUUID());
		await Array.fromAsync(Object.entries(corpus), async ([path, content]) => {
			await mkdir(dirname(join(root, path)), { recursive: true });
			await Bun.write(join(root, path), content);
		});
		const measurement = await measureCorpusVersion(
			this.workspace.runsDirectory,
			{
				kind: "directory",
				root,
			},
		);
		if (measurement.kind !== "version") {
			throw new Error(`Expected a corpus version: ${measurement.refusal}`);
		}

		return measurement;
	}
}

export {
	RecordedComparisonGroupWriter as default,
	type Checkpoint,
	type CorpusFiles,
	type Recording,
};
