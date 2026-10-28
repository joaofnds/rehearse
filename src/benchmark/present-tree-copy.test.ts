import { describe, expect, it } from "bun:test";
import { readdir, rm } from "node:fs/promises";
import { basename, join } from "node:path";

import copyPresentTree from "#benchmark/present-tree-copy";

import { directory, resources } from "./session-state-evidence-test-fixtures";

resources.registerCleanup();

const SIBLINGS = ["first", "second"];

async function copiesTheEntriesStillPresentWhenOneVanishesMidCopy(): Promise<void> {
	const source = await directory("rehearse-tree-source-");
	await Array.fromAsync(
		SIBLINGS,
		async (name) => await Bun.write(join(source, name), "listed\n"),
	);
	const destination = join(await directory("rehearse-tree-record-"), "copy");
	const survivors: string[] = [];
	const removeTheUnvisitedSiblingOnFirstVisit = async (
		path: string,
	): Promise<boolean> => {
		const name = basename(path);
		const [survivor] = survivors;
		if (survivor === undefined && SIBLINGS.includes(name)) {
			survivors.push(name);
			await rm(join(source, SIBLINGS.find((other) => other !== name) ?? ""));
		}

		return true;
	};

	await copyPresentTree(
		source,
		destination,
		removeTheUnvisitedSiblingOnFirstVisit,
	);

	expect(await readdir(destination)).toEqual(survivors);
}

async function leavesOutWhatTheFilterRefuses(): Promise<void> {
	const source = await directory("rehearse-tree-source-");
	await Bun.write(join(source, "kept.txt"), "kept\n");
	await Bun.write(join(source, "refused", "inner.txt"), "refused\n");
	const destination = join(await directory("rehearse-tree-record-"), "copy");

	await copyPresentTree(
		source,
		destination,
		async (path) => await Promise.resolve(path !== join(source, "refused")),
	);

	expect(await readdir(destination)).toEqual(["kept.txt"]);
}

describe(copyPresentTree.name, () => {
	it(
		"copies the entries still present when one vanishes mid-copy",
		copiesTheEntriesStillPresentWhenOneVanishesMidCopy,
	);
	it("leaves out what the filter refuses", leavesOutWhatTheFilterRefuses);
});
