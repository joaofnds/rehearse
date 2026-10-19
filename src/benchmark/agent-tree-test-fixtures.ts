import { join } from "node:path";

import type { AgentTreeInput, SubagentEvidence } from "#benchmark/agent-tree";
import { recordedSubagents } from "#benchmark/subagent-evidence";

const PREFIX_START_INDEX = 0;

const withMeta =
	(
		meta?: string,
	): ((recorded: readonly SubagentEvidence[]) => readonly SubagentEvidence[]) =>
	(recorded) =>
		recorded.map((each) => (each.agentId === "a1" ? { ...each, meta } : each));

const FIXTURE = join(import.meta.dir, "__fixtures__", "agent-tree");

const INHERITED_PREFIX_LINES = 3;

const LINES_BEFORE_A4_LAUNCH = 19;

interface FixtureOverrides {
	readonly prefixLinesExcluded?: number | undefined;
	readonly transcript?: (lines: readonly string[]) => readonly string[];
	readonly subagents?: (
		recorded: readonly SubagentEvidence[],
	) => readonly SubagentEvidence[];
}

async function fixtureInput(
	overrides: FixtureOverrides = {},
): Promise<AgentTreeInput> {
	const transcript = await Bun.file(join(FIXTURE, "transcript.jsonl")).text();
	const lines = transcript.split("\n");
	const recorded = await recordedSubagents(FIXTURE);

	return {
		attempt: {
			caseId: "case-a",
			corpusFiles: [],
			id: "attempt-a",
			kind: "session",
			model: "sonnet",
			outcome: "SUCCESSFUL",
		},
		prefixLinesExcluded:
			"prefixLinesExcluded" in overrides
				? overrides.prefixLinesExcluded
				: INHERITED_PREFIX_LINES,
		resolvedCorpusFiles: [],
		subagents: overrides.subagents?.(recorded) ?? recorded,
		transcript: (overrides.transcript?.(lines) ?? lines).join("\n"),
	};
}

const stray: SubagentEvidence = {
	agentId: "a9",
	meta: "{}",
	transcript: `${JSON.stringify({
		cwd: "/work",
		isSidechain: true,
		message: { content: "carry on", role: "user" },
		parentUuid: "u-earlier",
		type: "user",
	})}\n`,
};
export {
	PREFIX_START_INDEX,
	withMeta,
	FIXTURE,
	INHERITED_PREFIX_LINES,
	LINES_BEFORE_A4_LAUNCH,
	fixtureInput,
	stray,
};
