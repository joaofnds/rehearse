import {
	confirmationGroupRecordSchema,
	sessionConfirmationGroupRecordSchema,
} from "./confirmation-record";
import type { CorpusRoot } from "./corpus-file";
import type ConfirmationGroupWriters from "./recorded-runs-fixture-confirmation-group-writers";
import type { RecordedRunsContext } from "./recorded-runs-fixture-context";
import FrozenGroupCorpus from "./recorded-runs-fixture-frozen-group-corpus";
import GroupRecordData from "./recorded-runs-fixture-group-data";
import { serialize } from "./recorded-runs-fixture-record-io";
import { confirmationGroupPaths } from "./run-layout";

interface RecordSessionGroupFromRequest {
	readonly groupId: string;
	readonly corpusRoot: string;
	readonly layoutPaths: readonly string[];
}

interface FrozenGroupEvidenceProps {
	readonly context: RecordedRunsContext;
	readonly writers: ConfirmationGroupWriters;
}

class FrozenGroupEvidence {
	private readonly context: RecordedRunsContext;
	private readonly writers: ConfirmationGroupWriters;
	private readonly frozenCorpus: FrozenGroupCorpus;
	public constructor(props: FrozenGroupEvidenceProps) {
		this.context = props.context;
		this.writers = props.writers;
		this.frozenCorpus = new FrozenGroupCorpus({ context: props.context });
	}

	public readonly recordGroupFrom = async (
		source: CorpusRoot,
		withoutSkillOf?: string,
	): Promise<void> => {
		const paths = confirmationGroupPaths(
			this.context.runsDirectory,
			this.context.groupId,
		);
		const record = GroupRecordData.group(this.context.groupId);
		const { files, corpusVersion } = await this.frozenCorpus.stage({
			source,
			withoutSkillOf,
		});

		await Bun.write(
			paths.groupFile,
			serialize(
				confirmationGroupRecordSchema.parse({
					...record,
					inputs: { ...record.inputs, corpusVersion, files },
				}),
			),
		);
	};

	public readonly recordSessionGroupFrom = async ({
		groupId,
		corpusRoot,
		layoutPaths,
	}: RecordSessionGroupFromRequest): Promise<void> => {
		await this.writers.writeSessionGroup(groupId);
		const paths = confirmationGroupPaths(this.context.runsDirectory, groupId);
		const record = sessionConfirmationGroupRecordSchema.parse(
			JSON.parse(await Bun.file(paths.groupFile).text()),
		);
		const { files, corpusVersion } = await this.frozenCorpus.session({
			corpusRoot,
			groupId,
			layoutPaths,
		});

		await Bun.write(
			paths.groupFile,
			serialize(
				sessionConfirmationGroupRecordSchema.parse({
					...record,
					inputs: {
						...record.inputs,
						corpusVersion,
						files: [...record.inputs.files, ...files],
					},
				}),
			),
		);
	};
}
export { FrozenGroupEvidence as default };
