import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { deliverInstalledCorpus } from "./corpus-delivery";
import type { HomePathCitationMap } from "./home-path-citation";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

const citations: HomePathCitationMap = {
	home: "/home/user",
	roots: [{ layoutPath: "rulebook", path: "/home/user/.agents/rulebook" }],
};

const BYTE_ORDER_MARK = "﻿";

describe(deliverInstalledCorpus.name, () => {
	it("keeps a byte-order mark the authored file starts with", async () => {
		const installRoot = await testResources.createControlDirectory();
		const file = join(installRoot, "CLAUDE.md");
		await Bun.write(
			file,
			`${BYTE_ORDER_MARK}Read ~/.agents/rulebook/ownership.md`,
		);

		await deliverInstalledCorpus(
			installRoot,
			["CLAUDE.md", "rulebook/ownership.md"],
			citations,
		);

		expect(
			new TextDecoder("utf-8", { ignoreBOM: true }).decode(
				await Bun.file(file).bytes(),
			),
		).toBe(`${BYTE_ORDER_MARK}Read .claude/rulebook/ownership.md`);
	});
});
