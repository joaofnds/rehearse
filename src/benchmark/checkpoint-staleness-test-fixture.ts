import type { StageCorpus, StalenessRequest } from "./checkpoint";
import { CheckpointChainBuilder } from "./checkpoint-chain-test-builder";
import type { Immutable } from "./contracts";

const { initial, planning, build } = new CheckpointChainBuilder().build();

const chain = [initial, planning, build] as const;

class StageCorpusBuilder {
	public constructor(
		private readonly props: Immutable<Partial<StageCorpus>> = {},
	) {}
	public build(): StageCorpus {
		if ("refused" in this.props && this.props.refused !== undefined) {
			return { refused: this.props.refused };
		}

		return { hashed: "hashed" in this.props ? (this.props.hashed ?? []) : [] };
	}
}

const unchangedCorpus: ReadonlyMap<string, StageCorpus> = new Map(
	chain
		.filter(({ stage }) => stage !== "initial")
		.map((record) => [
			record.stage,
			new StageCorpusBuilder({ hashed: record.corpusFiles }).build(),
		]),
);

const request = {
	effort: "high" as const,
	judgeRubricCauses: new Map<string, readonly string[]>(),
	model: "sonnet",
} as const satisfies StalenessRequest;

export {
	initial,
	planning,
	build,
	chain,
	StageCorpusBuilder,
	unchangedCorpus,
	request,
};
