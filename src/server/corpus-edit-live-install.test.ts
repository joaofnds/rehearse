import { afterEach, describe, expect, it } from "bun:test";
import { symlink } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { linkCorpus, unlinkCorpus } from "#benchmark/corpus-source";
import { treeOf } from "#server/corpus-edit-snapshot-test-fixture";
import type { LiveSetup } from "#server/corpus-edit-workspace-test-fixture";
import {
	clearCorpusEditRoots,
	linkThrough,
	serving,
} from "#server/corpus-edit-workspace-test-fixture";

const LIVE_INSTALL_SITUATIONS = [
	[
		"with the live install linked",
		async (served: LiveSetup): Promise<void> => {
			await unlinkCorpus(served.runsDirectory);
		},
	],
	[
		"with a link to the live install's directory linked",
		async (served: LiveSetup): Promise<void> => {
			await linkThrough(served, served.installed.root);
		},
	],
	[
		"with a link to the live install's backing directory linked",
		async (served: LiveSetup): Promise<void> => {
			await linkThrough(served, served.installed.backingRoot);
		},
	],
	[
		"with a linked directory holding the live install, whose listed file links into it",
		async (served: LiveSetup): Promise<void> => {
			await symlink(
				join("installed", ".claude", "CLAUDE.md"),
				join(served.liveDirectory, "CLAUDE.md"),
			);
			await linkCorpus(served.runsDirectory, served.liveDirectory);
		},
	],
] as const;

afterEach(clearCorpusEditRoots);

describe("/api/corpus/edits", () => {
	describe("when the edit would write under the live install", () => {
		it.each(LIVE_INSTALL_SITUATIONS)(
			"refuses the apply and says so in the review, %s",
			async (_situation, arrange) => {
				const served = await serving();
				await arrange(served);
				const before = await treeOf(served.installed.root);
				const edit = { path: "CLAUDE.md", text: "edited from the browser\n" };
				const review = await served.driver.review(edit);

				const response = await served.driver.applyRaw({
					...edit,
					startsFrom: review.startsFrom,
				});

				expect(review.applyRefusal).toContain("live install");
				expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
				expect(await treeOf(served.installed.root)).toEqual(before);
			},
		);
	});
});
