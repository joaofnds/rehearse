import { expect, it } from "bun:test";

import { CommandError } from "./command";
import { RefusedPreconditionError } from "./exit-codes";
import { PipelineDefinitionError } from "./pipeline";
import type { PipelinePreflightDependencies } from "./preflight";
import { asRefusedPrecondition, assertPipelinePreflight } from "./preflight";
import { StageSettingsError } from "./stage-settings";

const LOADED_PRECONDITION_VALUE = 42;

const GIT_SHA1_HEX_DIGITS = 40;

const SHA256_HEX_DIGITS = 64;

const passingProbe = async (): Promise<void> => {
	await Promise.resolve();
};

const readySource = {
	origin: undefined,
	root: "/target",
	sha: "a".repeat(GIT_SHA1_HEX_DIGITS),
};
const passingSettings = {
	hashed: { path: "/settings.json", sha256: "b".repeat(SHA256_HEX_DIGITS) },
	json: "{}",
};

function dependencies(
	overrides: Partial<PipelinePreflightDependencies | undefined> = {},
): PipelinePreflightDependencies {
	return {
		assertControlReady: async () => await Promise.resolve("control-sha"),
		assertSourceReady: async () => await Promise.resolve(readySource),
		loadStageSettings: async () => await Promise.resolve(passingSettings),
		probeModel: passingProbe,
		...overrides,
	};
}

it("proceeds when every declared reference resolves", async () => {
	const loaded = await assertPipelinePreflight(
		{
			model: "sonnet",
			settingsFilePath: "/settings.json",
			sourceDir: "/target",
		},
		dependencies(),
	);

	expect(loaded).toBe(passingSettings);
});

it("halts naming the missing target before checking anything else", () => {
	const settingsCalls: string[] = [];
	const failure = assertPipelinePreflight(
		{
			model: "sonnet",
			settingsFilePath: "/settings.json",
			sourceDir: "/missing",
		},
		dependencies({
			assertSourceReady: async () =>
				await Promise.reject(new Error("Target must be the repository root")),
			loadStageSettings: async () => {
				settingsCalls.push("called");

				return await Promise.resolve(passingSettings);
			},
		}),
	);

	expect(failure).rejects.toBeInstanceOf(RefusedPreconditionError);
	expect(failure).rejects.toThrow("Target must be the repository root");
	expect(settingsCalls).toEqual([]);
});

it("propagates a git command failure instead of relabeling it a refused precondition", () => {
	const failure = assertPipelinePreflight(
		{
			model: "sonnet",
			settingsFilePath: "/settings.json",
			sourceDir: "/target",
		},
		dependencies({
			assertSourceReady: async () =>
				await Promise.reject(
					new CommandError(["git", "rev-parse"], {
						exitCode: 128,
						stderr: "fatal: not a git repository",
						stdout: "",
					}),
				),
		}),
	);

	expect(failure).rejects.toBeInstanceOf(CommandError);
});

it("halts naming the missing settings file before probing the model", () => {
	const probeCalls: string[] = [];
	const failure = assertPipelinePreflight(
		{
			model: "sonnet",
			settingsFilePath: "/missing.json",
			sourceDir: "/target",
		},
		dependencies({
			loadStageSettings: async () =>
				await Promise.reject(
					new StageSettingsError("No stage settings file at /missing.json"),
				),
			probeModel: async (model) => {
				probeCalls.push(model);

				await passingProbe();
			},
		}),
	);

	expect(failure).rejects.toBeInstanceOf(RefusedPreconditionError);
	expect(failure).rejects.toThrow("/missing.json");
	expect(probeCalls).toEqual([]);
});

it("halts naming the model last, once every file reference resolved", () => {
	const failure = assertPipelinePreflight(
		{
			model: "no-such-model",
			settingsFilePath: "/settings.json",
			sourceDir: "/target",
		},
		dependencies({
			probeModel: async (model) => {
				await Promise.reject(
					new RefusedPreconditionError(`unknown model ${model}`),
				);
			},
		}),
	);

	expect(failure).rejects.toBeInstanceOf(RefusedPreconditionError);
	expect(failure).rejects.toThrow("no-such-model");
});

it("returns the loaded value unchanged", () => {
	const expectedAsRefusedPrecondition = 42;

	expect(
		asRefusedPrecondition(
			async () => await Promise.resolve(LOADED_PRECONDITION_VALUE),
		),
	).resolves.toBe(expectedAsRefusedPrecondition);
});

it.each([
	["a missing pipeline file", () => new PipelineDefinitionError("no pipeline")],
	[
		"a missing stage settings file",
		() => new StageSettingsError("no settings"),
	],
])("wraps %s as a refused precondition", (_label, buildError) => {
	const failure = asRefusedPrecondition(
		async () => await Promise.reject(buildError()),
	);

	expect(failure).rejects.toBeInstanceOf(RefusedPreconditionError);
});

it("passes through an error of another kind", () => {
	const failure = asRefusedPrecondition(
		async () => await Promise.reject(new Error("something else broke")),
	);

	expect(failure).rejects.not.toBeInstanceOf(RefusedPreconditionError);
});
