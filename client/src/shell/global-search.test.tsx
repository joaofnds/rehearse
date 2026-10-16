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
	fireEvent.keyDown(document.body, { key: "Escape" });
	await waitFor(() => {
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});
});
