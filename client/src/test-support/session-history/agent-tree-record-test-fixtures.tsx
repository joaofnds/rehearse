import { join } from "node:path";

import { z } from "zod";

import agentCostAllocation from "#benchmark/agent-cost";
import type { AgentTreeInput } from "#benchmark/agent-tree";
import agentTree from "#benchmark/agent-tree";
import type { Immutable } from "#benchmark/contracts";
import { committedRateCatalog } from "#benchmark/rate-catalog";
import { sessionHistoryDetail } from "#benchmark/session-history";
import { recordedSubagents } from "#benchmark/subagent-evidence";
import type { AvailableAgents } from "#client/session-history/agent-tree-model";

const HISTORY = "/api/attempts/session/case-a/attempt-a/history";

const FIXTURE = join(
	import.meta.dir,
	"..",
	"..",
	"..",
	"..",
	"src",
	"benchmark",
	"__fixtures__",
	"agent-tree",
);

const INHERITED_PREFIX_LINES = 3;

/**
 * The doc-225 first fixture. Repeated: the root also reads CLAUDE.md and
 * review agent a1 reads it a second time. Orphaned: a3's meta file names a
 * parent agent the tree does not hold. Effort-tiered: a2 runs as the
 * reviewer-medium agent type.
 */
type Variant = "recorded" | "repeated" | "orphaned" | "effort-tiered";

function readRows(id: string, requestId: string): readonly string[] {
	return [
		JSON.stringify({
			cwd: "/work",
			message: {
				content: [
					{
						id,
						input: { file_path: "/work/CLAUDE.md" },
						name: "Read",
						type: "tool_use",
					},
				],
				model: "claude-sonnet-5",
				role: "assistant",
				stop_reason: "tool_use",
				usage: {
					cache_creation_input_tokens: 0,
					cache_read_input_tokens: 100,
					input_tokens: 2,
					output_tokens: 10,
				},
			},
			requestId,
			type: "assistant",
		}),
		JSON.stringify({
			cwd: "/work",
			message: {
				content: [
					{
						content: "1\tproject rules",
						is_error: false,
						tool_use_id: id,
						type: "tool_result",
					},
				],
				role: "user",
			},
			type: "user",
		}),
	];
}

function withMeta(
	meta: string | undefined,
	fields: Readonly<Record<string, string>>,
): string {
	return JSON.stringify({
		...z.record(z.string(), z.unknown()).parse(JSON.parse(meta ?? "{}")),
		...fields,
	});
}

async function fixtureInput(variant: Variant): Promise<AgentTreeInput> {
	const repeated = variant === "repeated";
	const transcript = await Bun.file(join(FIXTURE, "transcript.jsonl")).text();
	const subagents = await recordedSubagents(FIXTURE);

	return {
		attempt: {
			caseId: "case-a",
			corpusFiles: [],
			id: "attempt-a",
			kind: "session",
			model: "sonnet",
			outcome: "SUCCESSFUL",
		},
		prefixLinesExcluded: INHERITED_PREFIX_LINES,
		resolvedCorpusFiles: [],
		subagents: subagents.map((each) => {
			if (variant === "orphaned" && each.agentId === "a3") {
				return {
					agentId: each.agentId,
					meta: withMeta(each.meta, { parentAgentId: "zz9" }),
					transcript: each.transcript,
				};
			}

			if (variant === "effort-tiered" && each.agentId === "a2") {
				return {
					agentId: each.agentId,
					meta: withMeta(each.meta, { agentType: "reviewer-medium" }),
					transcript: each.transcript,
				};
			}

			return repeated && each.agentId === "a1"
				? {
						agentId: each.agentId,
						meta: each.meta,
						transcript: [
							each.transcript.trimEnd(),
							...readRows("toolu_a1r2", "req-a1-3"),
						].join("\n"),
					}
				: each;
		}),
		transcript: repeated
			? [transcript.trimEnd(), ...readRows("toolu_rr", "req-rr")].join("\n")
			: transcript,
	};
}

function deliveryReplies(
	input: Immutable<AgentTreeInput>,
	tree: Immutable<ReturnType<typeof agentTree>>,
): readonly (readonly [string, unknown])[] {
	const a1 = input.subagents.find(({ agentId }) => agentId === "a1");

	const a1Agent = tree.agents.find(({ agentId }) => agentId === "a1");

	const a1Deliveries =
		a1Agent?.evidence === "available" ? a1Agent.deliveryEvents : [];

	const excerpts = a1Deliveries.map(({ eventId }): [string, unknown] => [
		`${HISTORY}/agents/a1/${eventId}`,
		sessionHistoryDetail(
			{
				attempt: input.attempt,
				prefixLinesExcluded: 0,
				resolvedCorpusFiles: [],
				transcript: a1?.transcript,
			},
			eventId,
		),
	]);

	const rootExcerpts = tree.root.deliveryEvents.map(
		({ eventId }): [string, unknown] => [
			`${HISTORY}/${eventId}`,
			sessionHistoryDetail(input, eventId),
		],
	);
	return [...excerpts, ...rootExcerpts];
}

async function roundedCostAgents(): Promise<AvailableAgents> {
	const input = await fixtureInput("recorded");
	const cost = agentCostAllocation({
		...input,
		modelUsage: undefined,
		rates: committedRateCatalog,
	});
	if (cost.state !== "available") {
		throw new Error("The fixture has no cost allocation");
	}
	return {
		cost: { ...cost, calculated: { costUsd: 1.163421, state: "complete" } },
		state: "available",
		tree: agentTree(input),
	};
}

export { deliveryReplies, fixtureInput, HISTORY, roundedCostAgents };

export type { Variant };
