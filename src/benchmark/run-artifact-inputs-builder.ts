import type { RunArtifactInputs } from "./run-artifact";
import RunArtifactBaseInputsBuilder from "./run-artifact-test-fixtures";

class RunArtifactInputsBuilder extends RunArtifactBaseInputsBuilder {
	readonly #judge: RunArtifactInputs["judge"];
	readonly #reviewFile: string;
	public constructor(overrides: Partial<RunArtifactInputs> = {}) {
		super(overrides);
		this.#judge = overrides.judge ?? {
			attempts: [],
			costUsd: 0,
			grade: {
				requirements: [],
				summary: "ok",
				verdict: "PASS" as const,
			},
			prompt: "judge prompt",
		};
		this.#reviewFile = overrides.reviewFile ?? "/tmp/review.json";
	}
	public override build(): RunArtifactInputs {
		return {
			...super.build(),
			judge: this.#judge,
			reviewFile: this.#reviewFile,
		};
	}
}
export default RunArtifactInputsBuilder;
