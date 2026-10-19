import type { Immutable } from "#benchmark/contracts";
import type { StageSession } from "#server/stage-session";

import { RUN } from "./run-detail-records";

type ClosedStageSession = Extract<StageSession, { readonly state: "closed" }>;

class ClosedStageSessionBuilder {
	public constructor(
		private readonly props: Immutable<Partial<ClosedStageSession>> = {},
	) {}

	public build(): ClosedStageSession {
		return {
			lineCount: 1284,
			spans: [],
			state: "closed",
			transcriptPath: `.benchmark-runs/${RUN}.shape.session/transcript.jsonl`,
			...this.props,
		};
	}
}

export { ClosedStageSessionBuilder as default };
