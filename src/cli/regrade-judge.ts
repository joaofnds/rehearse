import type { SessionCase } from "#benchmark/case";
import type { JudgeInvoker } from "#benchmark/judge-attempt";
import type { RegradeRequest } from "#benchmark/session-regrade";
import { requireSpendCeiling } from "#benchmark/settings";
import { createSpendCeiling } from "#benchmark/spend-ceiling";
import { requireSpendAuthorization } from "#cli/interactive-stdin";

interface RegradeJudgeOptions {
	readonly model?: string | undefined;
	readonly stdinIsTerminal?: boolean | undefined;
}

interface RegradeJudgeDependencies {
	readonly invokeJudge?: JudgeInvoker | undefined;
	readonly requireSpendCeiling?: typeof requireSpendCeiling | undefined;
}

async function prepareRegradeJudge(
	request: RegradeJudgeOptions & { readonly runsDirectory: string },
	sessionCase: SessionCase,
	dependencies: RegradeJudgeDependencies,
): Promise<RegradeRequest["judge"]> {
	if (sessionCase.judge === undefined) {
		return undefined;
	}
	requireSpendAuthorization(
		request.model === undefined ? [] : ["--model", request.model],
		{},
		request.stdinIsTerminal ?? false,
	);

	return {
		invoke: dependencies.invokeJudge,
		model: request.model,
		spendCeiling: createSpendCeiling({
			ceilingUsd: await (
				dependencies.requireSpendCeiling ?? requireSpendCeiling
			)(request.runsDirectory),
		}),
	};
}

export { prepareRegradeJudge as default };
export type { RegradeJudgeOptions, RegradeJudgeDependencies };
