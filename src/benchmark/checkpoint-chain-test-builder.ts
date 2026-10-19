import type { CheckpointRecord } from "./checkpoint";
import CheckpointRecordBuilder from "./checkpoint-record-test-builder";

interface CheckpointChain {
	readonly initial: CheckpointRecord;
	readonly planning: CheckpointRecord;
	readonly build: CheckpointRecord;
}

const claudeMd = { path: "CLAUDE.md", sha256: "aa11" } as const;

const doctrine = {
	path: "skills/doctrine/SKILL.md",
	sha256: "dd44",
} as const;

class CheckpointChainBuilder {
	public constructor(
		private readonly props: Partial<Pick<CheckpointRecord, "corpusFiles">> = {},
	) {}

	public build(): CheckpointChain {
		const corpusFiles = this.props.corpusFiles ?? [claudeMd, doctrine];
		const root = new CheckpointRecordBuilder({ stage: "initial" }).build();
		const planning = new CheckpointRecordBuilder({
			corpusFiles: [
				...corpusFiles,
				{ path: "skills/shape/SKILL.md", sha256: "bb22" },
			],
			stage: "shape",
			upstream: root.lineage,
		}).build();
		const coding = new CheckpointRecordBuilder({
			corpusFiles: [
				...corpusFiles,
				{ path: "skills/build/SKILL.md", sha256: "cc33" },
			],
			stage: "build",
			upstream: planning.lineage,
		}).build();

		return { build: coding, initial: root, planning };
	}
}

export { CheckpointChainBuilder, claudeMd, doctrine };
