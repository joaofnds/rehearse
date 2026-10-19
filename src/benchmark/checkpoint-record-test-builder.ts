import type { CheckpointRecord } from "./checkpoint";
import { lineageKey } from "./checkpoint";
import type { Immutable } from "./contracts";

class CheckpointRecordBuilder {
	public constructor(
		private readonly props: Immutable<Partial<CheckpointRecord>> = {},
	) {}

	public build(): CheckpointRecord {
		const stage = this.props.stage ?? "discuss";
		const inputs = {
			artifacts: [],
			corpusFiles: [],
			effort: "high" as const,
			model: "sonnet",
			settingsFile: undefined,
			stage,
			targetSha: `${stage}-sha`,
			upstream: "root-key",
			...this.props,
		};

		return {
			...inputs,
			lineage: this.props.lineage ?? lineageKey(inputs),
			workflowState: this.props.workflowState ?? [],
		};
	}
}

export default CheckpointRecordBuilder;

export type { CheckpointRecord } from "./checkpoint";
