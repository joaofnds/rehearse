import { afterEach, describe, expect, it } from "bun:test";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import type {
	SessionHistoryEvent,
	SessionHistoryRequestEntry,
} from "#benchmark/session-history";
import {
	eventForRequestRow,
	requestRowsOwningEvents,
	SessionHistoryPage,
} from "./session-history-page";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

function renderStandalonePage(): void {
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

function renderPage(): void {
	stubFetchByPath(
		new Map([
			[
				"/api/attempts/session/case-a/attempt-a/history",
				{
					schemaVersion: 1,
					attempt: {
						kind: "session",
						caseId: "case-a",
						id: "attempt-a",
						model: "sonnet",
						outcome: "SUCCESSFUL",
						corpusFiles: [],
					},
					evidence: { state: "complete" },
					boundary: "known",
					startingContext: [],
					boundaryUnknown: [],
					startingSources: [],
					sources: [
						{
							id: "project:/work/early.md",
							kind: "project",
							name: "early.md",
							path: "/work/early.md",
							region: "attempt",
							firstLocator: { line: 6, block: 1 },
							measurement: { state: "complete", characters: 20 },
							observedDeliveryCount: 0,
							repeatDeliveryCount: 0,
							failedOccurrences: 0,
							partialOccurrences: 0,
							missingOccurrences: 0,
							unavailableOccurrences: 0,
							eventIds: [],
						},
						{
							id: "project:/work/late.md",
							kind: "project",
							name: "late.md",
							path: "/work/late.md",
							region: "attempt",
							firstLocator: { line: 7, block: 1 },
							measurement: { state: "complete", characters: 20 },
							observedDeliveryCount: 0,
							repeatDeliveryCount: 0,
							failedOccurrences: 0,
							partialOccurrences: 0,
							missingOccurrences: 0,
							unavailableOccurrences: 0,
							eventIds: [],
						},
						{
							id: "unclassified",
							kind: "unclassified",
							name: "Unclassified recorded content",
							region: "attempt",
							firstLocator: { line: 3, block: 1 },
							measurement: {
								state: "partial",
								observedCharacters: 20,
								reasons: ["mixed body"],
							},
							observedDeliveryCount: 0,
							repeatDeliveryCount: 0,
							failedOccurrences: 0,
							partialOccurrences: 1,
							missingOccurrences: 0,
							unavailableOccurrences: 0,
							eventIds: ["3:1"],
						},
						{
							id: "project:/work/CLAUDE.md",
							kind: "project",
							name: "CLAUDE.md",
							path: "/work/CLAUDE.md",
							region: "attempt",
							firstLocator: { line: 1, block: 1 },
							measurement: { state: "complete", characters: 12 },
							observedDeliveryCount: 1,
							repeatDeliveryCount: 0,
							failedOccurrences: 0,
							partialOccurrences: 0,
							missingOccurrences: 0,
							unavailableOccurrences: 0,
							eventIds: ["1:1", "2:1"],
						},
						{
							id: "tool-output:4:1",
							kind: "tool-output",
							name: "Bash · 4:1",
							region: "attempt",
							firstLocator: { line: 4, block: 1 },
							measurement: { state: "complete", characters: 8 },
							observedDeliveryCount: 0,
							repeatDeliveryCount: 0,
							failedOccurrences: 0,
							partialOccurrences: 0,
							missingOccurrences: 0,
							unavailableOccurrences: 0,
							eventIds: ["4:1"],
						},
						{
							id: "external:/outside.txt",
							kind: "external",
							name: "/outside.txt",
							path: "/outside.txt",
							region: "attempt",
							firstLocator: { line: 5, block: 1 },
							measurement: {
								state: "unavailable",
								reasons: ["unsupported text body"],
							},
							observedDeliveryCount: 0,
							repeatDeliveryCount: 0,
							failedOccurrences: 0,
							partialOccurrences: 0,
							missingOccurrences: 1,
							unavailableOccurrences: 1,
							eventIds: [],
						},
					],
					attemptEvents: [
						{
							id: "1:1",
							locator: { line: 1, block: 1 },
							region: "attempt",
							kind: "call",
							state: "invoked",
							label: "Read CLAUDE.md",
							timestamp: "2026-09-14T10:00:00.000Z",
							toolUseId: "read-1",
							toolName: "Read",
							sourceId: "project:/work/CLAUDE.md",
							measurement: { state: "unavailable", reasons: ["not delivered"] },
							relatedEventIds: ["2:1"],
						},
						{
							id: "2:1",
							locator: { line: 2, block: 1 },
							region: "attempt",
							kind: "result",
							state: "delivered",
							label: "CLAUDE.md delivered",
							toolUseId: "read-1",
							sourceId: "project:/work/CLAUDE.md",
							measurement: { state: "complete", characters: 12 },
							relatedEventIds: ["1:1"],
							deliveryOrdinal: 1,
						},
						{
							id: "3:1",
							locator: { line: 3, block: 1 },
							region: "attempt",
							kind: "unclassified",
							state: "partial",
							label: "Unclassified recorded content",
							sourceId: "unclassified",
							measurement: {
								state: "partial",
								observedCharacters: 20,
								reasons: ["mixed body"],
							},
							relatedEventIds: [],
						},
						{
							id: "4:1",
							locator: { line: 4, block: 1 },
							region: "attempt",
							kind: "result",
							state: "recorded",
							label: "Bash result",
							sourceId: "tool-output:4:1",
							measurement: { state: "complete", characters: 8 },
							relatedEventIds: [],
						},
					],
					diagnostics: {
						state: "partial",
						prefixLinesExcluded: 0,
						sourceLineCount: 3,
						measuredLineCount: 3,
						toolUseOccurrences: { total: 1, byName: [] },
						toolErrors: [
							{
								toolUseId: "failed-1",
								result: { line: 3, block: 1 },
							},
						],
						repeatedBashCommands: [],
						issues: [],
					},
				},
			],
			[
				"/api/attempts/session/case-a/attempt-a/history/4:1",
				{
					schemaVersion: 1,
					eventId: "4:1",
					locator: { line: 4, block: 1 },
					kind: "result",
					state: "recorded",
					relatedEventIds: [],
					deliveredText: "command output",
					deliveredMeasurement: { state: "complete", characters: 14 },
					snapshotMeasurement: {
						state: "unavailable",
						reasons: ["not recorded"],
					},
					applicationTruncated: false,
				},
			],
			[
				"/api/attempts/session/case-a/attempt-a/history/3:1",
				{
					schemaVersion: 1,
					eventId: "3:1",
					locator: { line: 3, block: 1 },
					kind: "unclassified",
					state: "partial",
					relatedEventIds: [],
					deliveredText: "partial recorded body",
					deliveredMeasurement: {
						state: "partial",
						observedCharacters: 20,
						reasons: ["mixed body"],
					},
					snapshotMeasurement: {
						state: "unavailable",
						reasons: ["not recorded"],
					},
					applicationTruncated: false,
				},
			],
			[
				"/api/attempts/session/case-a/attempt-a/history/1:1",
				{
					schemaVersion: 1,
					eventId: "1:1",
					locator: { line: 1, block: 1 },
					kind: "call",
					state: "invoked",
					relatedEventIds: ["2:1"],
					deliveredMeasurement: {
						state: "unavailable",
						reasons: ["not delivered"],
					},
					snapshotMeasurement: {
						state: "unavailable",
						reasons: ["not recorded"],
					},
					applicationTruncated: false,
				},
			],
			[
				"/api/attempts/session/case-a/attempt-a/history/2:1",
				{
					schemaVersion: 1,
					eventId: "2:1",
					locator: { line: 2, block: 1 },
					kind: "result",
					state: "delivered",
					relatedEventIds: ["1:1"],
					deliveredText: "instruction body",
					deliveredMeasurement: { state: "complete", characters: 16 },
					sourceSnapshot: "source snapshot",
					snapshotMeasurement: { state: "complete", characters: 15 },
					applicationTruncated: false,
				},
			],
			[
				"/api/attempts/session/case-a/attempt-a/history/requests",
				{
					series: {
						name: "total input tokens",
						measuresActiveContextWindow: false,
						omits: [
							"the request's own output tokens",
							"the model's context window limit, which the transcript does not carry",
						],
						boundary: "known",
						transcriptState: "saved",
						entries: [
							{
								requestId: "req-inherited",
								line: 1,
								region: "starting-context",
								model: "claude-opus-5",
								usageState: "complete",
								usage: {
									inputTokens: 7,
									outputTokens: 9,
									cacheReadTokens: 11,
									cacheWriteTokens: 13,
								},
								totalInputTokens: 31,
								cumulativeTotalInputTokens: 31,
								cacheWriteSplit: {
									state: "complete",
									fiveMinuteTokens: 0,
									oneHourTokens: 13,
								},
							},
							{
								requestId: "req-first",
								line: 2,
								region: "attempt",
								model: "claude-sonnet-5",
								usageState: "complete",
								usage: {
									inputTokens: 2,
									outputTokens: 151,
									cacheReadTokens: 100,
									cacheWriteTokens: 286_711,
								},
								totalInputTokens: 286_813,
								cumulativeTotalInputTokens: 286_844,
								cacheWriteSplit: {
									state: "complete",
									fiveMinuteTokens: 0,
									oneHourTokens: 286_711,
								},
							},
							{
								requestId: "req-second",
								line: 3,
								region: "attempt",
								model: "claude-sonnet-5",
								usageState: "complete",
								usage: {
									inputTokens: 6,
									outputTokens: 40,
									cacheReadTokens: 50,
									cacheWriteTokens: 280_000,
								},
								totalInputTokens: 280_056,
								cumulativeTotalInputTokens: 566_900,
								cacheWriteSplit: {
									state: "complete",
									fiveMinuteTokens: 0,
									oneHourTokens: 280_000,
								},
							},
							{
								line: 4,
								region: "attempt",
								model: "<synthetic>",
								usageState: "complete",
								usage: {
									inputTokens: 0,
									outputTokens: 0,
									cacheReadTokens: 0,
									cacheWriteTokens: 0,
								},
								totalInputTokens: 0,
								cumulativeTotalInputTokens: 566_900,
								cacheWriteSplit: {
									state: "complete",
									fiveMinuteTokens: 0,
									oneHourTokens: 0,
								},
							},
							{
								requestId: "req-conflict",
								line: 5,
								region: "attempt",
								usageState: "conflict",
							},
						],
						compactions: [{ line: 6, trigger: "auto", region: "attempt" }],
						attemptTotals: {
							state: "complete",
							requestCount: 4,
							usage: {
								inputTokens: 8,
								outputTokens: 191,
								cacheReadTokens: 150,
								cacheWriteTokens: 566_711,
							},
							totalInputTokens: 566_869,
						},
					},
					cost: {
						reported: { state: "complete", costUsd: 2.5 },
						calculated: {
							state: "incomplete",
							costUsd: 2.25,
							pricedRequestCount: 3,
							requestCount: 4,
							reasons: ["a request's duplicate rows disagree on usage"],
						},
						difference: {
							state: "incomplete",
							costUsd: 0.25,
							pricedRequestCount: 3,
							requestCount: 4,
							reasons: ["a reading it is drawn from is incomplete"],
						},
					},
					requestCosts: [
						{ line: 2, cost: { state: "priced", costUsd: 1.5 } },
						{ line: 3, cost: { state: "priced", costUsd: 0.75 } },
						{ line: 4, cost: { state: "priced", costUsd: 0 } },
						{
							line: 5,
							cost: {
								state: "unpriced",
								reason: "a request's duplicate rows disagree on usage",
							},
						},
					],
					instructionLoads: {
						state: "available",
						loads: [
							{
								filePath: "<path>/**bold**/<script>alert(1)</script>.md",
								memoryType: "User",
								loadReason: { state: "unavailable" },
								triggerFilePath: { state: "unavailable" },
								parentFilePath: { state: "unavailable" },
							},
						],
					},
				},
			],
		]),
	);
	renderStandalonePage();
}

describe(SessionHistoryPage.name, () => {
	it("cross-selects a source and walks its events with j and k", async () => {
		renderPage();
		await screen.findByRole("heading", { name: "Saved context history" });
		fireEvent.click(screen.getByRole("button", { name: /CLAUDE.md/u }));
		const ledger = screen.getByRole("listbox", { name: "Attempt events" });
		expect(within(ledger).getAllByRole("option")).toHaveLength(2);

		fireEvent.keyDown(ledger, { key: "j" });
		await waitFor(() => {
			expect(screen.getByText("instruction body")).toBeInTheDocument();
			expect(screen.getByText("source snapshot")).toBeInTheDocument();
		});
		fireEvent.click(screen.getByRole("button", { name: /CLAUDE.md/u }));
		expect(
			within(ledger).getByRole("option", { selected: true }),
		).toHaveTextContent("CLAUDE.md delivered");
		fireEvent.click(screen.getByRole("button", { name: /All sources/u }));
		expect(
			within(ledger).getByRole("option", { selected: true }),
		).toHaveTextContent("CLAUDE.md delivered");
		fireEvent.keyDown(ledger, { key: "k" });
		expect(
			within(ledger).getByRole("option", { selected: true }),
		).toHaveTextContent("Read CLAUDE.md");
		expect(
			screen.getByRole("button", { name: /CLAUDE.md/u }),
		).toHaveTextContent(
			"✓ Complete · 12 recorded text characters — not tokens",
		);
	});

	it("shows auditable source sorts and lets diagnostics clear a source filter", async () => {
		renderPage();
		await screen.findByRole("heading", { name: "Saved context history" });
		const sources = screen.getByRole("navigation", { name: "Loaded sources" });
		const sourceNames = (): string[] =>
			within(sources)
				.getAllByRole("button")
				.slice(1)
				.map((button) => button.textContent ?? "");

		expect(sourceNames()[0]).toContain("early.md");
		expect(sourceNames()[1]).toContain("late.md");
		expect(sourceNames()[2]).toContain("Unclassified recorded content");
		expect(sourceNames()[3]).toContain("CLAUDE.md");
		expect(sourceNames()[4]).toContain("Bash · 4:1");
		expect(sourceNames()[5]).toContain("/outside.txt");
		expect(sourceNames()[2]).toContain(
			"◐ Partial · 20 observed recorded text characters — not tokens · mixed body",
		);
		expect(sourceNames()[5]).toContain("? Unavailable · unsupported text body");

		fireEvent.click(screen.getByRole("button", { name: "Most repeated" }));
		expect(sourceNames()[0]).toContain("CLAUDE.md");
		expect(sourceNames()[1]).toContain("Unclassified recorded content");

		fireEvent.click(screen.getByRole("button", { name: /CLAUDE.md/u }));
		fireEvent.click(screen.getByRole("button", { name: /Tool error result/u }));
		await waitFor(() => {
			expect(screen.getByText("partial recorded body")).toBeInTheDocument();
		});
		expect(
			screen.getByRole("button", { name: /All sources/u }),
		).toHaveAttribute("aria-pressed", "true");
		expect(screen.getByText("2026-09-14T10:00:00.000Z")).toBeInTheDocument();
		expect(screen.queryByText("undefined")).not.toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: /Bash · 4:1/u }));
		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: "Saved result content" }),
			).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole("button", { name: /outside\.txt/u }));
		expect(
			screen.getByText("No events match this source."),
		).toBeInTheDocument();
	});

	it("heads a session attempt with its case, attempt id and outcome", async () => {
		renderPage();

		const header = await screen.findByRole("banner");

		expect(within(header).getByText("Attempt")).toBeInTheDocument();
		expect(within(header).getByText("attempt-a")).toBeInTheDocument();
		expect(within(header).getByText("Outcome")).toBeInTheDocument();
		expect(within(header).getByText("SUCCESSFUL")).toBeInTheDocument();
		expect(within(header).queryByText("Stage")).not.toBeInTheDocument();
	});

	it("heads a pipeline stage with its run, stage and lineage instead of an attempt id", async () => {
		stubFetchByPath(
			new Map([
				[
					"/api/attempts/session/case-a/attempt-a/history",
					{
						schemaVersion: 1,
						attempt: {
							kind: "stage",
							caseId: "case-a",
							run: "2026-09-06T21-58-29.508Z",
							stage: "shape",
							lineage: "lineage-1",
							upstream: "upstream-1",
							model: "sonnet",
							corpusFiles: [],
						},
						evidence: { state: "complete" },
						boundary: "known",
						startingContext: [],
						attemptEvents: [],
						boundaryUnknown: [],
						startingSources: [],
						sources: [],
					},
				],
			]),
		);
		renderStandalonePage();

		const header = await screen.findByRole("banner");

		expect(within(header).getByText("Run")).toBeInTheDocument();
		expect(
			within(header).getByText("2026-09-06T21-58-29.508Z"),
		).toBeInTheDocument();
		expect(within(header).getByText("Stage")).toBeInTheDocument();
		expect(within(header).getByText("shape")).toBeInTheDocument();
		expect(within(header).getByText("Lineage")).toBeInTheDocument();
		expect(within(header).getByText("lineage-1")).toBeInTheDocument();
		expect(within(header).queryByText("Attempt")).not.toBeInTheDocument();
		expect(within(header).queryByText("Outcome")).not.toBeInTheDocument();
	});

	it("says a stage records no request series rather than reporting a load failure", async () => {
		stubFetchByPath(
			new Map([
				[
					"/api/runs/run-1/stages/shape/history",
					{
						schemaVersion: 1,
						attempt: {
							kind: "stage",
							caseId: "case-a",
							run: "run-1",
							stage: "shape",
							lineage: "lineage-1",
							upstream: "upstream-1",
							model: "sonnet",
							corpusFiles: [],
						},
						evidence: { state: "complete" },
						boundary: "known",
						startingContext: [],
						attemptEvents: [],
						boundaryUnknown: [],
						startingSources: [],
						sources: [],
					},
				],
			]),
		);
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={client}>
				<SessionHistoryPage
					identity={{ kind: "stage", run: "run-1", stage: "shape" }}
				/>
			</QueryClientProvider>,
		);

		const timeline = await screen.findByRole("region", {
			name: "Request timeline",
		});

		expect(
			within(timeline).getByText("A saved stage records no request series."),
		).toBeInTheDocument();
		expect(within(timeline).queryByRole("alert")).not.toBeInTheDocument();
	});

	it("reconciles a stage's declared corpus against what its transcript shows", async () => {
		stubFetchByPath(
			new Map<string, unknown>([
				[
					"/api/runs/run-1/stages/shape/history",
					{
						schemaVersion: 1,
						attempt: {
							kind: "stage",
							caseId: "case-a",
							run: "run-1",
							stage: "shape",
							lineage: "lineage-1",
							upstream: "upstream-1",
							model: "sonnet",
							corpusFiles: [],
						},
						evidence: { state: "complete" },
						boundary: "known",
						startingContext: [],
						attemptEvents: [],
						boundaryUnknown: [],
						startingSources: [],
						sources: [],
					},
				],
				[
					"/api/runs/run-1/stages/shape/history/corpus",
					[
						{
							path: "CLAUDE.md",
							state: "observed",
							firstLocator: { line: 1, block: 1 },
						},
						{ path: "skills/build/SKILL.md", state: "no-observation-recorded" },
						{
							path: "agents/reviewer.md",
							state: "undeclared",
							firstLocator: { line: 3, block: 1 },
						},
					],
				],
			]),
		);
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={client}>
				<SessionHistoryPage
					identity={{ kind: "stage", run: "run-1", stage: "shape" }}
				/>
			</QueryClientProvider>,
		);

		const corpus = await screen.findByRole("region", {
			name: "Declared corpus",
		});

		expect(
			within(corpus)
				.getAllByRole("listitem")
				.map((item) => item.textContent),
		).toEqual([
			"CLAUDE.md Observed · 1:1",
			"skills/build/SKILL.md No observation recorded",
			"agents/reviewer.md Undeclared · 3:1",
		]);
	});

	it("names an empty historical attempt as boundary unknown", async () => {
		stubFetchByPath(
			new Map([
				[
					"/api/attempts/session/case-a/attempt-a/history",
					{
						schemaVersion: 1,
						attempt: {
							kind: "session",
							caseId: "case-a",
							id: "attempt-a",
							model: "sonnet",
							outcome: "SUCCESSFUL",
							corpusFiles: [],
						},
						evidence: {
							state: "partial",
							reasons: ["empty transcript", "attempt boundary unavailable"],
						},
						boundary: "unknown",
						startingContext: [],
						attemptEvents: [],
						boundaryUnknown: [],
						startingSources: [],
						sources: [],
					},
				],
			]),
		);
		renderStandalonePage();

		await screen.findByRole("heading", { name: "Saved context history" });
		expect(screen.getByText("Boundary unknown")).toBeInTheDocument();
		expect(
			screen.getByText("? Unavailable · boundary unknown"),
		).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: "Boundary-unknown events" }),
		).toBeInTheDocument();
	});

	it("renders one timeline row per request with its tokens, model and cost", async () => {
		renderPage();

		const timeline = await screen.findByRole("listbox", {
			name: "Request timeline",
		});

		const rows = within(timeline).getAllByRole("option");
		expect(rows).toHaveLength(5);
		expect(rows[1]).toHaveTextContent("286,813");
		expect(rows[1]).toHaveTextContent("claude-sonnet-5");
		expect(rows[1]).toHaveTextContent(
			"in 2 · out 151 · read 100 · write 286,711",
		);
		expect(rows[1]).toHaveTextContent("$1.50");
		expect(rows[2]).toHaveTextContent("280,056");
	});

	it("marks the request in flight when a compaction happened", async () => {
		renderPage();

		const timeline = await screen.findByRole("listbox", {
			name: "Request timeline",
		});

		const rows = within(timeline).getAllByRole("option");
		expect(rows[4]).toHaveTextContent("⇥ compaction after this request");
		expect(rows[3]).not.toHaveTextContent("compaction after this request");
	});

	it("names why an unpriced request carries no cost", async () => {
		renderPage();

		const timeline = await screen.findByRole("listbox", {
			name: "Request timeline",
		});

		const rows = within(timeline).getAllByRole("option");
		expect(rows[4]).toHaveTextContent(
			"? Unpriced · a request's duplicate rows disagree on usage",
		);
		expect(rows[0]).toHaveTextContent(
			"? Unpriced · starting-context requests are not priced",
		);
	});

	it("states that the active context window is not measured", async () => {
		renderPage();

		const timeline = await screen.findByRole("region", {
			name: "Request timeline",
		});

		expect(timeline).toHaveTextContent(
			/active context window is not measured/u,
		);
		expect(timeline).toHaveTextContent(/own output tokens/u);
	});

	it("selects the request whose evidence the event pane is showing", async () => {
		renderPage();
		await screen.findByRole("listbox", { name: "Request timeline" });
		const ledger = screen.getByRole("listbox", { name: "Attempt events" });

		const thirdEvent = within(ledger).getAllByRole("option").at(2);
		if (thirdEvent === undefined) {
			throw new Error("the fixture records fewer than three attempt events");
		}
		fireEvent.click(thirdEvent);

		await waitFor(() => {
			const rows = screen
				.getByRole("listbox", { name: "Request timeline" })
				.querySelectorAll('[aria-selected="true"]');
			expect(rows).toHaveLength(1);
			expect(rows[0]).toHaveTextContent("req-second");
		});
	});

	it("selects an event when its request is picked on the timeline", async () => {
		renderPage();
		const timeline = await screen.findByRole("listbox", {
			name: "Request timeline",
		});

		const fourthRow = within(timeline).getAllByRole("option").at(3);
		if (fourthRow === undefined) {
			throw new Error("the fixture records fewer than four requests");
		}
		fireEvent.click(fourthRow);

		await waitFor(() => {
			const ledger = screen.getByRole("listbox", { name: "Attempt events" });
			expect(
				within(ledger)
					.getAllByRole("option")
					.find((option) => option.getAttribute("aria-selected") === "true"),
			).toHaveTextContent("Bash result");
		});
	});

	it("narrows the timeline to the requests a selected source's events belong to", async () => {
		renderPage();
		await screen.findByRole("listbox", { name: "Request timeline" });

		fireEvent.click(screen.getByRole("button", { name: /CLAUDE.md/u }));

		await waitFor(() => {
			expect(
				within(
					screen.getByRole("listbox", { name: "Request timeline" }),
				).getAllByRole("option"),
			).toHaveLength(2);
		});
	});

	it("renders saved instruction markup as visible text rather than as markup", async () => {
		renderPage();

		const timeline = await screen.findByRole("region", {
			name: "Request timeline",
		});

		const load = within(timeline).getByText(
			"<path>/**bold**/<script>alert(1)</script>.md",
			{ selector: "code" },
		);
		expect(load).toBeInTheDocument();
		expect(load.querySelector("script")).toBeNull();
		expect(load.querySelector("strong")).toBeNull();
		expect(load.innerHTML).toBe(
			"&lt;path&gt;/**bold**/&lt;script&gt;alert(1)&lt;/script&gt;.md",
		);
		expect(timeline).toHaveTextContent(
			/reason, trigger and include parent unavailable/u,
		);
	});

	it("names a stopped stage's reason instead of reporting a load failure", async () => {
		stubFetchByPath(
			new Map<string, unknown>([
				[
					"/api/runs/run-1/stages/build/history/corpus",
					[{ path: "CLAUDE.md", state: "no-observation-recorded" }],
				],
				[
					"/api/runs/run-1/stages/build/history",
					{
						schemaVersion: 1,
						attempt: {
							kind: "stopped-stage",
							caseId: "case-a",
							run: "run-1",
							stage: "build",
							error: "build stage graded C; minimum grade is B",
							model: "sonnet",
							corpusFiles: [{ path: "CLAUDE.md", sha256: "a".repeat(64) }],
						},
						evidence: {
							state: "unavailable",
							reasons: ["this stage stopped before recording a transcript"],
						},
						boundary: "known",
						startingContext: [],
						attemptEvents: [],
						boundaryUnknown: [],
						startingSources: [],
						sources: [],
					},
				],
			]),
		);
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={client}>
				<SessionHistoryPage
					identity={{ kind: "stage", run: "run-1", stage: "build" }}
				/>
			</QueryClientProvider>,
		);

		const heading = await screen.findByRole("banner");

		expect(heading).toHaveTextContent(
			/Stopped because.*build stage graded C; minimum grade is B/u,
		);
		expect(heading).not.toHaveTextContent(/Lineage/u);
		expect(
			screen.queryByText("Could not load saved history."),
		).not.toBeInTheDocument();

		const corpus = await screen.findByRole("region", {
			name: "Declared corpus",
		});

		expect(
			within(corpus)
				.getAllByRole("listitem")
				.map((item) => item.textContent),
		).toEqual(["CLAUDE.md No observation recorded"]);
	});

	it("reports a stage whose page genuinely failed to load as a failure", async () => {
		stubFetchByPath(new Map<string, unknown>());
		const client = new QueryClient({
			defaultOptions: { queries: { retry: false } },
		});
		render(
			<QueryClientProvider client={client}>
				<SessionHistoryPage
					identity={{ kind: "stage", run: "run-1", stage: "nonexistent" }}
				/>
			</QueryClientProvider>,
		);

		const alert = await screen.findByRole("alert");

		expect(alert).toHaveTextContent("Could not load saved history.");
	});
});

const textOnlyReply: SessionHistoryRequestEntry = {
	requestId: "req-a",
	line: 10,
	region: "attempt",
	usageState: "conflict",
};
const toolCallingRequest: SessionHistoryRequestEntry = {
	requestId: "req-b",
	line: 20,
	region: "attempt",
	usageState: "conflict",
};
const ownershipEntries = [textOnlyReply, toolCallingRequest];

function eventAtLine(line: number): SessionHistoryEvent {
	return {
		id: `${line}:1`,
		locator: { line, block: 1 },
		region: "attempt",
		kind: "result",
		state: "recorded",
		label: `event at ${line}`,
		measurement: { state: "complete", characters: 1 },
		relatedEventIds: [],
	};
}

describe(requestRowsOwningEvents.name, () => {
	it("keeps a request whose events all sit on later lines than its own", () => {
		const events = [eventAtLine(12), eventAtLine(13)];

		const owning = requestRowsOwningEvents(ownershipEntries, events);

		expect(owning.map(({ requestId }) => requestId)).toEqual(["req-a"]);
	});

	it("drops a request no visible event belongs to", () => {
		const events = [eventAtLine(21)];

		const owning = requestRowsOwningEvents(ownershipEntries, events);

		expect(owning.map(({ requestId }) => requestId)).toEqual(["req-b"]);
	});
});

describe(eventForRequestRow.name, () => {
	it("selects nothing for a request that recorded no event of its own", () => {
		const events = [eventAtLine(20)];

		expect(
			eventForRequestRow(ownershipEntries, events, textOnlyReply),
		).toBeUndefined();
	});

	it("selects the first event the request owns, not the next request's", () => {
		const events = [eventAtLine(12), eventAtLine(20)];

		expect(
			eventForRequestRow(ownershipEntries, events, textOnlyReply)?.id,
		).toBe("12:1");
	});
});
