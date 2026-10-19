import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { recordOutput } from "./cli-test-support";
import SessionAttemptTestFiles from "./session-attempt-test-files";
import StageSessionRuntime from "./stage-session-runtime";

const resources = SessionAttemptTestFiles.forEachTest();

describe(StageSessionRuntime.name, () => {
	it("reads the records location through its unbound callback for corpus evidence", async () => {
		const directory = await resources.temporary("rehearse-stage-runtime-");
		const corpusSource = {
			kind: "directory",
			root: join(directory, "corpus"),
		} as const;
		await Bun.write(join(corpusSource.root, "CLAUDE.md"), "instructions\n");
		const unboundCalls: boolean[] = [];
		const runtime = new StageSessionRuntime({
			corpusSource,
			output: recordOutput().output,
			recordsDirectory: function recordsDirectory(this: undefined): string {
				unboundCalls.push(this === undefined);
				return join(directory, "records");
			},
		});

		const measurement = await runtime.measureCorpus();
		const files = await runtime.corpusVersionFiles(measurement);

		expect(unboundCalls).toEqual([true, true]);
		expect(measurement.kind).toBe("version");
		expect(files.map(({ path }) => path)).toEqual(["CLAUDE.md"]);
	});
});
