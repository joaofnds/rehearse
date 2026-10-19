import type { Immutable } from "#benchmark/contracts";
import type { RecordedAnalysis } from "#benchmark/root-cause-analysis";

import { SHA256_HEX_CHARACTERS } from "./digest-widths";
import { RUN } from "./run-detail-records";

const BASE_RECORDED_ANALYSIS: RecordedAnalysis = {
	bundleBytes: 1200,
	bundleDigest: "b".repeat(SHA256_HEX_CHARACTERS),
	capUsd: 1,
	costUsd: 0.24,
	durationMs: 41_000,
	model: "sonnet",
	narrative: "Build skipped the scope declaration the shape step asked for.",
	outcome: "recorded",
	pairedRerun:
		"Replay step 2 with the scope-declaration block changed and nothing else.",
	rootCause: {
		file: "skills/implement.md",
		lines: { end: 30, start: 12 },
		stage: "build",
	},
	run: RUN,
	schemaVersion: 2,
	stages: [
		{
			contribution: "set up the scope the judge read",
			note: "Shape named the scope.",
			role: "not a factor",
			stage: "shape",
		},
		{
			contribution: "dropped the declared scope",
			note: "Build ignored the declared scope.",
			role: "root cause",
			stage: "build",
		},
		{ role: "never ran", stage: "verify" },
	],
	startedAt: "2026-09-28T10:48:00.000Z",
};

class RecordedAnalysisBuilder {
	public constructor(
		private readonly props: Immutable<Partial<RecordedAnalysis>> = {},
	) {}

	public build(): RecordedAnalysis {
		return { ...BASE_RECORDED_ANALYSIS, ...this.props };
	}
}

export { RecordedAnalysisBuilder as default };
