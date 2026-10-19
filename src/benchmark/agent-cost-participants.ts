import type { AgentCostInput } from "./agent-cost-contract";
import type { AgentTree, SubAgent } from "./agent-tree";
import type { Immutable } from "./contracts";
import type { SessionHistoryRequestSeries } from "./session-history";
import { skillName } from "./skill-cost-windows";
import { parseTranscript } from "./transcript";
import type { TranscriptLine } from "./transcript";

const NO_TRANSCRIPT_PREFIX_ROWS = 0;

const ROOT = Symbol("root");

type Owner = typeof ROOT | string;

interface Participant {
	readonly owner: Owner;
	readonly agent: SubAgent | undefined;
	readonly series: SessionHistoryRequestSeries;
	readonly lines: readonly TranscriptLine[];
	readonly attemptStart: number;
}

function participantsOf(
	input: Immutable<AgentCostInput>,
	tree: Immutable<AgentTree>,
): ReadonlyMap<Owner, Participant> {
	const transcripts = new Map(
		input.subagents.map(({ agentId, transcript }) => [agentId, transcript]),
	);
	const participants = new Map<Owner, Participant>([
		[
			ROOT,
			{
				agent: undefined,
				attemptStart: input.prefixLinesExcluded ?? NO_TRANSCRIPT_PREFIX_ROWS,
				lines: parseTranscript(input.transcript),
				owner: ROOT,
				series: tree.root.series,
			},
		],
	]);

	for (const agent of tree.agents) {
		const transcript = transcripts.get(agent.agentId);
		if (
			agent.evidence === "available" &&
			agent.context !== "inherited" &&
			transcript !== undefined
		) {
			participants.set(agent.agentId, {
				agent,
				attemptStart: 0,
				lines: parseTranscript(transcript),
				owner: agent.agentId,
				series: agent.series,
			});
		}
	}

	return participants;
}

function forkedSkillOf(
	agent: Immutable<SubAgent>,
	participants: ReadonlyMap<Owner, Participant>,
): string | undefined {
	const { parent, launchCallLine } = agent;
	if (parent.state === "unlinked") {
		return undefined;
	}

	const call = participants
		.get(parent.state === "root" ? ROOT : parent.agentId)
		?.lines.find(({ line }) => line === launchCallLine)
		?.locatedToolUses.find(({ use }) => use.name === "Skill");

	return skillName(call?.use.input);
}
export { ROOT, participantsOf, forkedSkillOf };
export type { Owner, Participant };
