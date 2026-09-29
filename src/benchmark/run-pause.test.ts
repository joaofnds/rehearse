import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { benchmarkRunPaths } from "./run-layout";
import {
	pauseRequested,
	pausedStage,
	recordPaused,
	requestPause,
} from "./run-pause";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

async function runPaths(): Promise<ReturnType<typeof benchmarkRunPaths>> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-run-pause-"));
	testResources.track(directory);

	return benchmarkRunPaths(directory, "run-1");
}

describe(requestPause.name, () => {
	it("is what pauseRequested reads back", async () => {
		const paths = await runPaths();
		expect(await pauseRequested(paths)).toBe(false);

		await requestPause(paths, "2026-09-29T10:00:00.000Z");

		expect(await pauseRequested(paths)).toBe(true);
	});
});

describe(recordPaused.name, () => {
	it("names the stage the run paused after", async () => {
		const paths = await runPaths();
		expect(await pausedStage(paths)).toBeUndefined();

		await recordPaused(paths, "shape", "2026-09-29T10:05:00.000Z");

		expect(await pausedStage(paths)).toBe("shape");
	});
});
