import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import { TestResources } from "#benchmark/test-support";

import { checkpointlessStageRecorded } from "./run-status";

describe(checkpointlessStageRecorded.name, () => {
	const resources = TestResources.forEachTest();

	it.each(["STAGE_JUDGE_FAILED", "AWAITING_STAGE_JUDGE"])(
		"recognizes %s despite an overflowing number in unused metadata",
		async (status) => {
			const root = await mkdtemp(join(tmpdir(), "rehearse-stage-record-"));
			resources.track(root);
			const paths = benchmarkRunPaths(root, "recorded-run");
			await Bun.write(
				paths.stageFile("build"),
				`{"status":"${status}","stage":"build","error":"judge failed","extra":1e400}`,
			);

			const recorded = await checkpointlessStageRecorded(paths, "build");

			expect(recorded).toBe(true);
		},
	);
});
