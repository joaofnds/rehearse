import type { Questioner } from "./calibration";
import type { BenchmarkCase } from "./case";
import type { BenchmarkConfig } from "./config";
import type { RunProgress } from "./run-diagnostics";
import type { LoadedStageSettings } from "./stage-settings";

interface BenchmarkRunInputs {
	readonly config: BenchmarkConfig;
	readonly benchmarkCase: BenchmarkCase;
	readonly loadedSettings: LoadedStageSettings;
}
interface BenchmarkRunInteraction {
	readonly rl: Questioner;
	readonly progress: RunProgress;
	readonly spendCeilingUsd: number;
}
export type { BenchmarkRunInputs, BenchmarkRunInteraction };
