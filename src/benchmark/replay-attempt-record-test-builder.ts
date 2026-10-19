import AttemptScorecardBuilder from "./attempt-scorecard-test-builder";
import type { ScorecardFixture } from "./attempt-scorecard-test-builder";
import type { Immutable } from "./contracts";

interface ReplayRecordFixture {
	readonly replay: true;
	readonly timestamp: string;
	readonly runName: string;
	readonly stage: string;
	readonly consumed: {
		readonly stage: string;
		readonly lineage: string;
		readonly targetSha: string;
	};
	readonly baseSha: string;
	readonly lineage: string;
	readonly corpusFiles: readonly { path: string; sha256: string }[];
	readonly model: string;
	readonly judgeModel: string;
	readonly sessionBudgetUsd: number;
	readonly controlSha: string;
	readonly stageCostUsd: number;
	readonly productOwnerCostUsd: number;
	readonly judgeCostUsd: number;
	readonly scorecard: ScorecardFixture;
}
const LINEAGE = "lineage-1";
const SHA256_BYTES = 32;
class ReplayAttemptRecordBuilder {
	readonly #props: Immutable<Partial<ReplayRecordFixture>>;
	#content = "new spec\n";
	public constructor(props: Immutable<Partial<ReplayRecordFixture>> = {}) {
		this.#props = props;
	}
	public withArtifactContent(content: string): this {
		this.#content = content;
		return this;
	}
	public build(): ReplayRecordFixture {
		return {
			baseSha: "base-sha",
			consumed: {
				lineage: LINEAGE,
				stage: "initial",
				targetSha: "task-sha",
			},
			controlSha: "control-sha",
			corpusFiles: [
				{
					path: "CLAUDE.md",
					sha256: "aa".repeat(SHA256_BYTES),
				},
			],
			judgeCostUsd: 0.3,
			judgeModel: "sonnet",
			lineage: "replay-lineage",
			model: "sonnet",
			productOwnerCostUsd: 0.2,
			replay: true,
			runName: "run1",
			scorecard: {
				...new AttemptScorecardBuilder().build(),
				costUsd: 0.3,
				grade: {
					...new AttemptScorecardBuilder().build().grade,
					grade: "A",
				},
				input: {
					artifact: {
						content: this.#content,
						path: "backlog/docs/D.md",
					},
					stage: "discuss",
				},
			},
			sessionBudgetUsd: 5,
			stage: "discuss",
			stageCostUsd: 0.7,
			timestamp: this.#props.timestamp ?? "2026-08-30T10:00:00.000Z",
			...this.#props,
		};
	}
}
export default ReplayAttemptRecordBuilder;
