import { afterEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { agentCostAllocation } from "#benchmark/agent-cost";
import { agentTree } from "#benchmark/agent-tree";
import type { AgentTreeInput } from "#benchmark/agent-tree";
import { committedRateCatalog } from "#benchmark/rate-catalog";
import {
	sessionHistoryDetail,
	sessionHistoryReport,
} from "#benchmark/session-history";
import { recordedSubagents } from "#benchmark/subagent-evidence";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { SessionHistoryPage } from "./session-history-page";

const FIXTURE = join(
	import.meta.dir,
	"..",
	"..",
	"..",
	"src",
	"benchmark",
	"__fixtures__",
	"agent-tree",
);
const INHERITED_PREFIX_LINES = 3;
const HISTORY = "/api/attempts/session/case-a/attempt-a/history";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function readRows(id: string, requestId: string): readonly string[] {
	return [
		JSON.stringify({
			type: "assistant",
			requestId,
			message: {
				model: "claude-sonnet-5",
				role: "assistant",
				stop_reason: "tool_use",
				content: [
					{
						type: "tool_use",
						id,
						name: "Read",
						input: { file_path: "/work/CLAUDE.md" },
					},
				],
				usage: {
					input_tokens: 2,
					output_tokens: 10,
					cache_read_input_tokens: 100,
					cache_creation_input_tokens: 0,
				},
			},
			cwd: "/work",
		}),
		JSON.stringify({
			type: "user",
			message: {
				role: "user",
				content: [
					{
						type: "tool_result",
						tool_use_id: id,
						content: "1\tproject rules",
						is_error: false,
					},
				],
			},
			cwd: "/work",
		}),
	];
}

/**
 * The doc-225 first fixture, where the root may also read CLAUDE.md and
 * review agent a1 may read it a second time.
 */
async function fixtureInput(repeated: boolean): Promise<AgentTreeInput> {
	const transcript = await Bun.file(join(FIXTURE, "transcript.jsonl")).text();
	const subagents = await recordedSubagents(FIXTURE);

	return {
		attempt: {
			kind: "session",
			caseId: "case-a",
			id: "attempt-a",
			model: "sonnet",
			outcome: "SUCCESSFUL",
			corpusFiles: [],
		},
		resolvedCorpusFiles: [],
		transcript: repeated
			? [transcript.trimEnd(), ...readRows("toolu_rr", "req-rr")].join("\n")
			: transcript,
		prefixLinesExcluded: INHERITED_PREFIX_LINES,
		subagents: subagents.map((each) =>
			repeated && each.agentId === "a1"
				? {
						agentId: each.agentId,
						meta: each.meta,
						transcript: [
							each.transcript.trimEnd(),
							...readRows("toolu_a1r2", "req-a1-3"),
						].join("\n"),
					}
				: each,
		),
	};
}

async function renderFixturePage(repeated = false): Promise<void> {
	const input = await fixtureInput(repeated);
	const a1 = input.subagents.find(({ agentId }) => agentId === "a1");
	const tree = agentTree(input);
	const a1Agent = tree.agents.find(({ agentId }) => agentId === "a1");
	const a1Deliveries =
		a1Agent?.evidence === "available" ? a1Agent.deliveryEvents : [];
	const excerpts = a1Deliveries.map(({ eventId }): [string, unknown] => [
		`${HISTORY}/agents/a1/${eventId}`,
		sessionHistoryDetail(
			{
				attempt: input.attempt,
				resolvedCorpusFiles: [],
				transcript: a1?.transcript,
				prefixLinesExcluded: 0,
			},
			eventId,
		),
	]);
	stubFetchByPath(
		new Map<string, unknown>([
			[HISTORY, sessionHistoryReport(input)],
			[
				`${HISTORY}/agents`,
				{
					state: "available",
					tree,
					cost: agentCostAllocation({
						...input,
						rates: committedRateCatalog,
						modelUsage: undefined,
					}),
				},
			],
			...excerpts,
		]),
	);
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<SessionHistoryPage
				identity={{ kind: "standalone", caseId: "case-a", uuid: "attempt-a" }}
			/>
		</QueryClientProvider>,
	);
}

function agentTreeNav(): Promise<HTMLElement> {
	return screen.findByRole("navigation", { name: "Agent tree" });
}

async function select(label: string): Promise<HTMLElement> {
	const button = within(await agentTreeNav())
		.getAllByRole("button")
		.find(({ textContent }) => textContent.startsWith(label));
	if (button === undefined) {
		throw new Error(`no tree entry starts with ${label}`);
	}
	fireEvent.click(button);

	return screen.getByRole("region", { name: "Selected in the agent tree" });
}

describe("agent tree in the saved-attempt workbench", () => {
	it("nests each agent under the agent that launched it", async () => {
		await renderFixturePage();

		const nav = await agentTreeNav();

		const a2 = within(nav).getByRole("listitem", { name: /^a2/u });
		expect(
			within(a2).getByRole("button", { name: /^a3/u }),
		).toBeInTheDocument();
		expect(
			within(nav).getByRole("button", { name: /^a1 · reviewer/u }),
		).toBeInTheDocument();
		expect(
			within(nav).getByRole("button", { name: /^Skill review\b/u }),
		).toBeInTheDocument();
	});

	it("shows a review agent's context, loads, model, tokens and cost with its basis", async () => {
		await renderFixturePage();

		const detail = await select("a1 · reviewer");

		expect(detail).toHaveTextContent("Review agent");
		expect(detail).toHaveTextContent("not a harness role");
		expect(detail).toHaveTextContent("Context began fresh");
		expect(detail).toHaveTextContent("claude-sonnet-5");
		expect(detail).toHaveTextContent("Stopped by the user");
		expect(
			within(detail).getByRole("list", { name: "Context history" }),
		).toHaveTextContent("req-a1-1");
		expect(
			within(detail).getByRole("list", { name: "Load evidence" }),
		).toHaveTextContent("CLAUDE.md");
		expect(detail).toHaveTextContent(
			"in 5 · out 320 · read 1,500 · write 1,540",
		);
		expect(detail).toHaveTextContent(
			"every attempt request in the agent's own transcript",
		);
		expect(detail).toHaveTextContent(
			"own cost plus each descendant's total; never added into the attempt total",
		);
	});

	it("shows a skill's own cost and its total including descendants", async () => {
		await renderFixturePage();

		const detail = await select("Skill review ");

		expect(
			within(detail).getByRole("definition", { name: "Own cost" }),
		).toHaveTextContent("delivery-to-next-boundary window");
		expect(
			within(detail).getByRole("definition", {
				name: "Including descendants",
			}),
		).toHaveTextContent("a1");
	});

	it("reads each agent's peak from its own lane only", async () => {
		await renderFixturePage();

		const rootPeak = within(await select("Session root")).getByRole(
			"definition",
			{ name: "Context peak" },
		).textContent;
		const a2Peak = within(await select("a2 · reviewer")).getByRole(
			"definition",
			{ name: "Context peak" },
		).textContent;

		expect(rootPeak).not.toBe(a2Peak);
		expect(a2Peak).toContain("this agent's own window");
	});

	it("marks coverage and the attempt total incomplete when a child's evidence is missing", async () => {
		await renderFixturePage();

		const nav = await agentTreeNav();

		expect(
			within(nav).getByRole("button", { name: /^a4 · evidence unavailable/u }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("status", { name: "Agent coverage" }),
		).toHaveTextContent("Incomplete · no kept transcript for a4");
		expect(
			screen.getByRole("status", { name: "Calculated attempt total" }),
		).toHaveTextContent("Incomplete");
	});

	it("lists the agents a source reached and each delivery with its excerpt", async () => {
		await renderFixturePage(true);
		const sources = await screen.findByRole("navigation", {
			name: "Loaded sources",
		});

		fireEvent.click(
			within(sources).getByRole("button", { name: /CLAUDE\.md/u }),
		);

		const receiving = await screen.findByRole("region", {
			name: "Receiving agents",
		});
		expect(
			within(receiving).getByRole("listitem", { name: /^Session root/u }),
		).toHaveTextContent("1 delivery");
		const a1 = within(receiving).getByRole("listitem", { name: /^a1/u });
		expect(a1).toHaveTextContent("2 deliveries · repeated");
		expect(receiving).toHaveTextContent(
			"recorded text characters, not tokens and not cost",
		);
		const [second] = within(a1)
			.getAllByRole("button", {
				name: "Open excerpt",
			})
			.slice(1);
		if (second === undefined) {
			throw new Error("a1 lists one excerpt");
		}
		fireEvent.click(second);
		await waitFor(() => {
			expect(
				screen.getByRole("region", { name: "Delivery excerpt" }),
			).toHaveTextContent("project rules");
		});
	});
});
