import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import {
	confirmationPathsExpected,
	repPathsExpected,
} from "./record-layout-path-fixtures";
import RecordLayoutFixtures from "./record-layout-test-fixtures";
import {
	benchmarkRunsDirectory,
	confirmationGroupIds,
	confirmationGroupPaths,
} from "./run-layout";

const fixtures = RecordLayoutFixtures.forEachTest();

function assignsOneDurablePathToEveryGroupAndRepArtifact(): void {
	const paths = confirmationGroupPaths(
		benchmarkRunsDirectory("/control"),
		"group-1",
	);
	const rep = paths.rep("group-1-rep-2");

	expect(paths).toMatchObject(confirmationPathsExpected);
	expect(rep).toMatchObject(repPathsExpected(paths.repsDirectory));
	expect(rep.stageFile("build")).toBe(
		join(paths.repsDirectory, "group-1-rep-2", "stages", "build.json"),
	);
	expect(rep.checkpointDirectory("build")).toBe(
		join(paths.repsDirectory, "group-1-rep-2", "checkpoints", "build"),
	);
}

async function namesEveryConfirmationGroupDirectory(): Promise<void> {
	const root = await fixtures.root();
	await mkdir(join(root, "confirmations", "group-2"), { recursive: true });
	await mkdir(join(root, "confirmations", "group-1"), { recursive: true });

	expect(await confirmationGroupIds(root)).toEqual(["group-1", "group-2"]);
}

describe(confirmationGroupPaths.name, () => {
	it(
		"assigns one durable path to every group and rep artifact",
		assignsOneDurablePathToEveryGroupAndRepArtifact,
	);
});
describe("recorded record enumeration", () => {
	it(
		"names every confirmation group directory",
		namesEveryConfirmationGroupDirectory,
	);
});
