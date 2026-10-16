import { afterEach, expect, it } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderAppWithStub } from "#client/test-support/render-app";

import {
	UNREAD_RUN_FIGURES,
	UNREAD_REPLAY_FIGURES,
} from "#client/test-support/run-figures";

const originalFetch = globalThis.fetch;
afterEach(() => {
	globalThis.fetch = originalFetch;
});

it("opens with the keyboard, searches existing collections, and closes with Escape", async () => {
	renderAppWithStub(
		"/",
		new Map([
			[
				"/api/run-listing",
				{
					rows: [
						{
							...UNREAD_RUN_FIGURES,
							kind: "run",
							recordId: "run:audit-run",
							run: "audit-run",
							shortId: "audit/r2",
							caseId: "audit",
							status: "RUNNING",
							stage: "build",
							grade: "A",
							launchId: undefined,
							checkpoints: [],
							links: [],
							corpusVersion: { kind: "version", digest: "abc" },
							corpusChangedDuringRun: false,
							progress: { state: "running" },
						},
						{
							...UNREAD_REPLAY_FIGURES,
							kind: "replay",
							recordId: "replay:lineage/audit-replay",
							lineage: "lineage",
							timestamp: "audit-replay",
							shortId: "audit/rp",
							checkpointShortId: undefined,
							attempt: undefined,
							caseId: "audit",
							stage: "build",
							grade: "C",
							status: "STOP",
							corpusVersion: { kind: "version", digest: "abc" },
							links: [
								{
									state: "available",
									label: "comparison",
									href: "/comparisons/audit-related",
								},
								{
									state: "available",
									label: "context",
									href: "/replays/lineage/audit-replay",
								},
							],
						},
					],
					launches: [],
					unreadable: [],
				},
			],
			[
				"/api/cases",
				{
					cases: [{ id: "audit", title: "Audit sessions", kind: "session" }],
					unreadable: [],
					unreadableRecords: [],
				},
			],
			[
				"/api/corpus",
				{
					root: "/corpus",
					digest: "abc",
					files: [{ path: "skills/audit.md", sha256: "123" }],
					refusals: [],
					lastEdit: { kind: "not-recorded", reason: "none" },
				},
			],
			[
				"/api/comparisons",
				{
					comparisons: [
						{
							digest: "audit-comparison",
							caseIds: ["audit"],
							mode: "stage",
							reps: 2,
						},
					],
					unreadable: [],
				},
			],
		]),
	);
	await screen.findByRole("button", { name: /Search everything/u });
	fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
	const dialog = await screen.findByRole("dialog", {
		name: "Search everything",
	});
	await waitFor(() => {
		expect(within(dialog).getByRole("searchbox")).toHaveFocus();
	});
	fireEvent.change(within(dialog).getByRole("searchbox"), {
		target: { value: "audit" },
	});
	expect(
		await within(dialog).findByRole("link", { name: /skills\/audit.md/u }),
	).toHaveAttribute("href", "/corpus?file=skills%2Faudit.md");
	expect(
		within(dialog).getByRole("link", { name: /Audit sessions/u }),
	).toHaveAttribute("href", "/cases?caseId=audit");
	expect(
		within(dialog).getByRole("link", { name: /Comparison audit-compar/u }),
	).toHaveAttribute("href", "/comparisons/audit-comparison");
	expect(within(dialog).getByRole("link", { name: /Run r2/u })).toHaveAttribute(
		"href",
		"/runs/audit-run?view=activity",
	);
	expect(
		within(dialog).getByRole("link", { name: /Replay rp/u }),
	).toHaveAttribute("href", "/replays/lineage/audit-replay");
	expect(within(dialog).getAllByRole("link")[0]).toHaveAttribute(
		"href",
		"/cases?caseId=audit",
	);
	expect(within(dialog).getByText(/Saved metadata only/u)).toBeInTheDocument();
	fireEvent.click(within(dialog).getByRole("button", { name: "Instructions" }));
	expect(within(dialog).getAllByRole("link")).toHaveLength(1);
	expect(within(dialog).getByRole("link")).toHaveAttribute(
		"href",
		"/corpus?file=skills%2Faudit.md",
	);
	fireEvent.keyDown(document.body, { key: "Escape" });
	await waitFor(() => {
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});
	expect(
		screen.getByRole("button", { name: "Search everything" }),
	).toHaveFocus();
});

it("keeps an exact case ahead of many run matches and previews their outcome and cost", async () => {
	renderAppWithStub(
		"/",
		new Map<string, unknown>([
			[
				"/api/cases",
				{
					cases: [
						{ id: "audit-log", title: "Audit log case", kind: "pipeline" },
					],
					unreadable: [],
					unreadableRecords: [],
				},
			],
			[
				"/api/run-listing",
				{
					rows: Array.from({ length: 40 }, (_unused, index) => ({
						...UNREAD_RUN_FIGURES,
						kind: "run",
						recordId: `run:${String(index)}`,
						run: `2026-10-02T09-00-${String(index).padStart(2, "0")}.000Z`,
						caseId: "audit-log",
						status: "COMPLETED",
						progress: { state: "ended" },
						finalOutcome: {
							state: "available",
							status: "JUDGED",
							verdict: "FAIL",
						},
						cost: { state: "available", usd: 1.23, parts: [], missing: [] },
					})),
					launches: [],
					unreadable: [],
				},
			],
		]),
	);
	fireEvent.click(
		await screen.findByRole("button", { name: "Search everything" }),
	);
	const dialog = await screen.findByRole("dialog", {
		name: "Search everything",
	});
	fireEvent.change(within(dialog).getByRole("searchbox"), {
		target: { value: "audit-log" },
	});
	await within(dialog).findByRole("link", { name: /Case audit-log/u });
	expect(within(dialog).getAllByRole("link")[0]).toHaveAttribute(
		"href",
		"/cases?caseId=audit-log",
	);
	expect(
		within(dialog).getByRole("region", { name: "Runs search results" }),
	).toHaveTextContent("Final FAIL · $1.23 reported cost");
	fireEvent.click(within(dialog).getByRole("button", { name: "Cases" }));
	expect(within(dialog).getAllByRole("link")).toHaveLength(1);
});

it("ranks an exact instruction path above a case whose ID only starts with the query", async () => {
	renderAppWithStub(
		"/",
		new Map<string, unknown>([
			[
				"/api/cases",
				{
					cases: [{ id: "guide-case", title: "A guide case", kind: "session" }],
					unreadable: [],
					unreadableRecords: [],
				},
			],
			[
				"/api/corpus",
				{
					root: "/corpus",
					digest: "abc",
					files: [{ path: "guide", sha256: "123" }],
					refusals: [],
					lastEdit: { kind: "not-recorded", reason: "none" },
				},
			],
		]),
	);
	fireEvent.click(
		await screen.findByRole("button", { name: "Search everything" }),
	);
	const dialog = await screen.findByRole("dialog", {
		name: "Search everything",
	});
	fireEvent.change(within(dialog).getByRole("searchbox"), {
		target: { value: "guide" },
	});
	await within(dialog).findByRole("link", { name: /Instruction guide/u });
	expect(
		within(dialog)
			.getAllByRole("link")
			.map((link) => link.getAttribute("href")),
	).toEqual(["/corpus?file=guide", "/cases?caseId=guide-case"]);
});
