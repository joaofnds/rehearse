import { describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { HomePathCitationMap } from "./home-path-citation";
import stageLiveReads from "./stage-live-reads";
import { stageTranscriptFile } from "./stage-transcript-evidence";
import { TestResources } from "./test-support";

const resources = TestResources.forEachTest();

const SESSION_ID = "00000000-0000-4000-8000-000000000001";

const citations: HomePathCitationMap = {
	home: "/home/user",
	roots: [{ layoutPath: "rulebook", path: "/home/user/.agents/rulebook" }],
};

function toolUseLine(
	name: string,
	input: Readonly<Record<string, string>>,
): string {
	return `${JSON.stringify({
		message: { content: [{ id: "use-1", input, name, type: "tool_use" }] },
		type: "assistant",
	})}\n`;
}

async function countsLiveReadsInTheStageSessionAndItsSubagents(): Promise<void> {
	const root = await resources.createControlDirectory();
	const targetDir = join(root, "target");
	const transcript = {
		projectsDirectory: join(root, "projects"),
		sessionId: SESSION_ID,
	};
	const main = stageTranscriptFile(targetDir, transcript);
	const subagents = join(main.replace(/\.jsonl$/u, ""), "subagents");
	await mkdir(subagents, { recursive: true });
	await Bun.write(
		main,
		toolUseLine("Read", {
			file_path: "/home/user/.agents/rulebook/ownership.md",
		}),
	);
	await Bun.write(
		join(subagents, "agent-a1.jsonl"),
		toolUseLine("Bash", { command: "cat ~/.agents/rulebook/ownership.md" }),
	);

	expect(
		await stageLiveReads({
			citations,
			held: ["CLAUDE.md", "rulebook/ownership.md"],
			targetDir,
			transcript,
		}),
	).toEqual([{ count: 2, path: "rulebook/ownership.md" }]);
}

async function readsNothingWithoutATranscript(): Promise<void> {
	expect(
		await stageLiveReads({
			citations,
			held: ["rulebook/ownership.md"],
			targetDir: "/nowhere",
			transcript: undefined,
		}),
	).toEqual([]);
}

describe(stageLiveReads.name, () => {
	it(
		"counts live reads in the stage session and its sub-agents",
		countsLiveReadsInTheStageSessionAndItsSubagents,
	);

	it("reads nothing without a transcript", readsNothingWithoutATranscript);
});
