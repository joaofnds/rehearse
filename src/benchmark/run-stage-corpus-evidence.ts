import type { HashedFile } from "./checkpoint";
import { captureTreatmentChecks } from "./checks";
import type { LocalCheckResult } from "./contracts";
import type { CorpusMeasurement } from "./corpus-measurement";
import { measureCorpusVersion, measuredCorpusFiles } from "./corpus-version";
import type { TargetCheck } from "./pipeline";
import type { PreparedRunExecution } from "./run-execution-context";

class RunStageCorpusEvidence {
	public constructor(private readonly request: PreparedRunExecution) {}
	public readonly captureTreatmentChecks = async (
		targetDir: string,
		checks: readonly TargetCheck[],
	): Promise<LocalCheckResult> =>
		await captureTreatmentChecks(
			targetDir,
			checks,
			this.request.execution.output.log,
		);
	public readonly corpusVersionFiles = async (
		measurement: CorpusMeasurement,
	): Promise<readonly HashedFile[]> =>
		await measuredCorpusFiles(
			this.request.execution.identity.files.runsDirectory,
			measurement,
		);
	public readonly measureCorpus = async (): Promise<CorpusMeasurement> =>
		await measureCorpusVersion(
			this.request.execution.identity.files.runsDirectory,
			this.request.prepared.evidence.corpus.source,
		);
}
export { RunStageCorpusEvidence as default };
