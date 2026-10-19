import type { ReplayCliConfig } from "#benchmark/config";
import { recordOutput } from "#cli/cli-test-support";
import type {
	ReplayCommandDependencies,
	ReplayCommandOutcome,
} from "#cli/replay-command";

const STORED_SPEND_CEILING_USD = 100;

interface ReplayAdapterOptions {
	readonly run: string;
	readonly execute: ReplayCommandDependencies["execute"];
}

async function storedSpendCeiling(): Promise<number> {
	return await Promise.resolve(STORED_SPEND_CEILING_USD);
}

class ComparisonReplayAdapter implements ReplayCommandDependencies {
	private readonly run: string;
	private readonly executeReplay: ReplayCommandDependencies["execute"];
	private readonly observedConfigs: ReplayCliConfig[] = [];
	private readonly observedModels: string[] = [];
	public readonly recorder = recordOutput();
	public readonly output = this.recorder.output;

	public constructor({ run, execute }: ReplayAdapterOptions) {
		this.run = run;
		this.executeReplay = execute;
	}

	public get configs(): readonly ReplayCliConfig[] {
		return this.observedConfigs;
	}

	public get probedModels(): readonly string[] {
		return this.observedModels;
	}

	public readonly execute: ReplayCommandDependencies["execute"] = async (
		replay,
		authorization,
	) => {
		this.observedConfigs.push(replay.config);

		return await this.executeReplay(replay, authorization);
	};

	public readonly probeModel = async (model: string): Promise<void> => {
		this.observedModels.push(model);

		await Promise.resolve();
	};

	public readonly requireSpendCeiling = storedSpendCeiling;

	public readonly resolveRunDirectory = async (): Promise<string> =>
		await Promise.resolve(`/runs/${this.run}`);
}

function confirmationExecution(
	groupId: string,
): ReplayCommandDependencies["execute"] {
	return async () => {
		const outcome: ReplayCommandOutcome = await Promise.resolve({
			evidence: {
				groupRecordFile: `/runs/confirmations/${groupId}/group.json`,
				repRecordFiles: [],
				reportFile: `/runs/confirmations/${groupId}/report.json`,
			},
			kind: "confirmation",
		});

		return outcome;
	};
}

export { ComparisonReplayAdapter, confirmationExecution };
