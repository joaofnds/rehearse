import { describe, expect, it } from "bun:test";

import { parseStaleArgs } from "./config";

function readsTheModelAReplayWouldUseFromTheEnvironment(): void {
	const config = parseStaleArgs([], { BENCHMARK_MODEL: "opus" });

	expect(config.model).toBe("opus");
}

function takesModelOverTheEnvironment(): void {
	const config = parseStaleArgs(["--model", "haiku"], {
		BENCHMARK_MODEL: "opus",
	});

	expect(config.model).toBe("haiku");
}

function readsTheEffortAReplayWouldUse(): void {
	const config = parseStaleArgs(["--effort", "high"], {});

	expect(config.effort).toBe("high");
}

function assertsNoModelAndNoEffortWhenNeitherIsNamed(): void {
	const config = parseStaleArgs([], {});

	expect(config).toEqual({});
}

function refusesAnEffortTheWorkflowDoesNotSupport(): void {
	expect(() => parseStaleArgs(["--effort", "turbo"], {})).toThrow(
		"Unsupported effort for workflow",
	);
}

describe(parseStaleArgs.name, () => {
	it(
		"reads the model a replay would use from the environment",
		readsTheModelAReplayWouldUseFromTheEnvironment,
	);
	it("takes --model over the environment", takesModelOverTheEnvironment);
	it("reads the effort a replay would use", readsTheEffortAReplayWouldUse);
	it(
		"asserts no model and no effort when neither is named",
		assertsNoModelAndNoEffortWhenNeitherIsNamed,
	);
	it(
		"refuses an effort the workflow does not support",
		refusesAnEffortTheWorkflowDoesNotSupport,
	);
});
