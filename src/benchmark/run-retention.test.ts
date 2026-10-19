import { describe, expect, it } from "bun:test";
import { dirname, join } from "node:path";

import { runCommand } from "./command";
import { retainedCheckpointRecorder, retentionInTarget } from "./run-retention";
import { cloneTarget } from "./target-clone";
import { TestResources, commitAll } from "./test-support";

const testResources = TestResources.forEachTest();
describe(retainedCheckpointRecorder.name, () => {
	it("records the checkpoint and pins its commit under refs/rehearse", async () => {
		const source = await testResources.createRepository();
		const target = await testResources.createRepository();
		const checkpointDir = join(source.directory, ".checkpoints", "initial");

		const record = await retainedCheckpointRecorder(
			"run-1",
			retentionInTarget(target.directory),
		)(source.directory, checkpointDir, {
			artifacts: [],
			corpusFiles: [],
			model: "sonnet",
			stage: "initial",
			targetSha: source.sha,
			upstream: "root-key",
		});

		expect(record.stage).toBe("initial");
		expect(
			await Bun.file(join(checkpointDir, "checkpoint.json")).exists(),
		).toBe(true);
		const retainedSha = await runCommand(
			["git", "rev-parse", "refs/rehearse/run-1"],
			source.directory,
		);
		expect(retainedSha.trim()).toBe(source.sha);
	});
});

describe(retentionInTarget.name, () => {
	it("copies the pinned commit into the target the checkout was cloned from", async () => {
		const target = await testResources.createRepository();
		const checkout = await cloneTarget(target.directory);
		testResources.track(dirname(checkout));
		await Bun.write(join(checkout, "candidate.txt"), "candidate\n");
		await commitAll(checkout, "feat: candidate");
		const candidate = await runCommand(["git", "rev-parse", "HEAD"], checkout);

		await retentionInTarget(target.directory)(
			checkout,
			"run-1",
			candidate.trim(),
		);

		const retained = await runCommand(
			["git", "rev-parse", "refs/rehearse/run-1"],
			target.directory,
		);
		expect(retained.trim()).toBe(candidate.trim());
	});
});
