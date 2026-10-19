import type { InitialRunEvidence } from "./run-initial-evidence-contract";
import type { PreparedRunTarget } from "./run-target-preparation";

interface PreparedBenchmarkRun {
	readonly target: PreparedRunTarget;
	readonly evidence: InitialRunEvidence;
}
export type { PreparedBenchmarkRun };
