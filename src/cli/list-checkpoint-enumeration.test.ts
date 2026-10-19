import { describe, expect, it } from "bun:test";
import { chmod, rm } from "node:fs/promises";

import { benchmarkRunPaths } from "#benchmark/run-layout";
import { CliTestWorkspace, recordOutput } from "#cli/cli-test-support";
import { runList } from "#cli/list-command";
import {
	INACCESSIBLE_PERMISSIONS,
	PRIVATE_DIRECTORY_PERMISSIONS,
} from "#server/file-permissions-test-support";

const workspace = CliTestWorkspace.forEachTest();

describe("checkpoint discovery", () => {
	describe("when a recorded run has no checkpoints directory", () => {
		it("prints the other checkpoints without an unreadable diagnostic", async () => {
			const fixture = await workspace.writtenRecords();
			const paths = benchmarkRunPaths(
				fixture.runsDirectory,
				fixture.unreplayableRun,
			);
			await rm(paths.checkpointsDirectory, { recursive: true });
			const recorder = recordOutput();

			await runList(
				{ kind: "checkpoints", runsDirectory: fixture.runsDirectory },
				recorder.output,
			);

			expect(recorder.stdout.join("")).toContain(
				`checkpoint:${fixture.replayableRun}/build`,
			);
			expect(recorder.stderr.join("")).toBe("");
		});
	});

	describe("when a recorded run's checkpoints directory cannot be read", () => {
		it(
			"reports the unreadable run and retains neighboring checkpoint rows",
			reportsAnUnreadableRun,
		);
	});
});

async function reportsAnUnreadableRun(): Promise<void> {
	const fixture = await workspace.writtenRecords();
	const paths = benchmarkRunPaths(
		fixture.runsDirectory,
		fixture.unreplayableRun,
	);
	const recorder = recordOutput();
	await chmod(paths.checkpointsDirectory, INACCESSIBLE_PERMISSIONS);

	try {
		await runList(
			{ kind: "checkpoints", runsDirectory: fixture.runsDirectory },
			recorder.output,
		);

		expect(recorder.stdout.join("").trimEnd().split("\n")).toEqual([
			`checkpoint:${fixture.replayableRun}/build\t-\tbuild\tlineage-build`,
			`checkpoint:${fixture.replayableRun}/discuss\t-\tdiscuss\tlineage-discuss`,
		]);
		expect(recorder.stderr.join("")).toContain(
			`run:${fixture.unreplayableRun}`,
		);
		expect(recorder.stderr.join("")).toContain("EACCES");
	} finally {
		await chmod(paths.checkpointsDirectory, PRIVATE_DIRECTORY_PERMISSIONS);
	}
}
