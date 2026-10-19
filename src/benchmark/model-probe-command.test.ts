import { expect, it } from "bun:test";

import { CommandError } from "./command";
import { RefusedPreconditionError } from "./exit-codes";
import { defaultModelProbe, defaultProbeModel } from "./model-preflight";

it("resolves with the child process's stdout on a clean exit", () => {
	const probe = defaultModelProbe(
		"sonnet",
		async (_command, _cwd, _options) =>
			await Promise.resolve('{"session_id":"session-1","is_error":false}'),
	);

	expect(probe()).resolves.toBe('{"session_id":"session-1","is_error":false}');
});

it("resolves with the failed child process's stdout instead of throwing", () => {
	const rejectedStdout =
		'{"session_id":"session-1","is_error":true,"result":"model rejected"}';
	const probe = defaultModelProbe(
		"bad-model",
		async () =>
			await Promise.reject(
				new CommandError(["claude"], {
					exitCode: 1,
					stderr: "",
					stdout: rejectedStdout,
				}),
			),
	);

	expect(probe()).resolves.toBe(rejectedStdout);
});

it("rethrows a failure that carries no stdout to read as an envelope", () => {
	const probe = defaultModelProbe(
		"sonnet",
		async () => await Promise.reject(new Error("spawn ENOENT")),
	);

	expect(probe()).rejects.toThrow("spawn ENOENT");
});

it("resolves when the provider accepts the model", async () => {
	await defaultProbeModel(
		"sonnet",
		async () => await Promise.resolve('{"session_id":"s","is_error":false}'),
	);
});

it("refuses naming the model when the provider rejects it", () => {
	const probe = defaultProbeModel(
		"bad-model",
		async () =>
			await Promise.reject(
				new CommandError(["claude"], {
					exitCode: 1,
					stderr: "",
					stdout: '{"session_id":"s","is_error":true,"result":"unknown model"}',
				}),
			),
	);

	expect(probe).rejects.toBeInstanceOf(RefusedPreconditionError);
	expect(probe).rejects.toThrow("bad-model");
});
