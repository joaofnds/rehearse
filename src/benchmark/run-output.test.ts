import { describe, expect, it } from "bun:test";

import RunOutput from "./run-output";

describe(RunOutput.name, () => {
	it("writes progress through the original unbound callback", () => {
		const calls: { readonly message: string; readonly hasReceiver: boolean }[] =
			[];
		function recordProgress(this: undefined, message: string): void {
			calls.push({ hasReceiver: this !== undefined, message });
		}
		const progress = {
			flush: async () => {
				await Promise.resolve();
			},
			log: recordProgress,
		};
		const output = new RunOutput(progress);

		output.writeProgress("progress");

		expect(calls).toEqual([{ hasReceiver: false, message: "progress" }]);
		expect(output.log).toBe(recordProgress);
	});
});
