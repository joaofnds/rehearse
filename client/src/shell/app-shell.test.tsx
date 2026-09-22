import { afterEach, describe, expect, it } from "bun:test";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { CorpusResponse } from "#client/corpus/corpus-query";
import type { RunHistoryResponse } from "#client/run-history/run-history-query";
import { stubFetchByPath } from "#client/test-support/fetch-stub";
import { createAppRouter } from "#client/router";
import { renderAppAt } from "#client/test-support/render-app";
import { NAV_ITEMS } from "./nav-items";
import { CHORD_DESTINATIONS } from "./use-go-to-shortcut";

const originalFetch = globalThis.fetch;

/**
 * Answers every path but `failing` with the shell's baseline bodies, and
 * rejects that one the way an unreachable server does, so a screen's
 * error branch is observed against a real rejection rather than a body that
 * merely lacks fields.
 */
function stubFetchFailing(failing: string): void {
	const stub = (request: string | URL | Request): Promise<Response> => {
		const { pathname } = new URL(
			request instanceof Request ? request.url : request,
			"http://localhost",
		);
		if (pathname === failing) {
			return Promise.reject(new Error("connection refused"));
		}

		return Promise.resolve(Response.json({ rows: [], unreadable: [] }));
	};
	stub.preconnect = fetch.preconnect;
	globalThis.fetch = stub;
}

/**
 * Waits long enough that a navigation the keystroke under test might have
 * started would have landed. The wait is what gives the assertion after it any
 * force: without it the check runs in the same tick as the keystroke and
 * passes whether or not the shortcut fired, which was observed by removing
 * each guard and watching both tests keep passing.
 */
async function navigationWouldHaveLanded(): Promise<void> {
	await waitFor(() => {
		expect(
			screen.getByRole("navigation", { name: "Sections" }),
		).toBeInTheDocument();
	});
	await Promise.resolve();
}

afterEach(() => {
	globalThis.fetch = originalFetch;
});

type RunHistoryRow = RunHistoryResponse["rows"][number];
type CorpusFile = CorpusResponse["files"][number];

function runRow(run: string): RunHistoryRow {
	return {
		run,
		caseId: "audit-log",
		status: "COMPLETE",
		stage: "build",
		grade: "B",
		corpus: { digest: "a3a62f" },
		stale: false,
		staleCauses: [],
		progress: { state: "recorded" },
	};
}

function corpusFile(path: string): CorpusFile {
	return {
		path,
		sha256: "a".repeat(64),
		lastEditedAt: "2026-09-22T09:12:00.000Z",
		readBy: 0,
	};
}

function renderShellAt(
	path: string,
	served?: { readonly runs: number; readonly corpusFiles: number },
): void {
	const runs = served?.runs ?? 0;
	const corpusFiles = served?.corpusFiles ?? 0;

	stubFetchByPath(
		new Map<string, unknown>([
			[
				"/api/runs",
				{
					rows: Array.from({ length: runs }, (_unused, index) =>
						runRow(`2026-09-06T21-58-29.50${index}Z`),
					),
					unreadable: [],
				},
			],
			[
				"/api/corpus",
				{
					root: "/corpus",
					digest: "ffd58d",
					files: Array.from({ length: corpusFiles }, (_unused, index) =>
						corpusFile(`file-${index}.md`),
					),
					refusals: [],
				},
			],
		]),
	);

	renderAppAt(path);
}

const SPEC_NAV_LABELS = [
	"Run history",
	"Live monitor",
	"Run detail",
	"Comparisons",
	"Corpus",
	"Tasks",
	"Cases",
	"Calibration",
	"Settings",
];

const NAV_LABEL = new RegExp(`^(?:${SPEC_NAV_LABELS.join("|")})$`, "u");

describe("the navigation shell", () => {
	it("lists the design's nine sections in its order", async () => {
		renderShellAt("/");

		const nav = await screen.findByRole("navigation", { name: "Sections" });
		const labels = within(nav)
			.getAllByText(NAV_LABEL)
			.map((label) => label.textContent);

		expect(labels).toEqual(SPEC_NAV_LABELS);
	});

	it("offers no link for a section that has no screen", async () => {
		renderShellAt("/");

		const nav = await screen.findByRole("navigation", { name: "Sections" });
		const linked = within(nav)
			.getAllByRole("link")
			.map((link) => within(link).getByText(NAV_LABEL).textContent);

		expect(linked).toEqual(["Run history", "Corpus"]);
	});

	it("reaches run history from another screen by pressing g then r", async () => {
		renderShellAt("/corpus", { runs: 0, corpusFiles: 137 });

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: "Instruction corpus" }),
			).toBeInTheDocument();
		});

		fireEvent.keyDown(document, { key: "g" });
		fireEvent.keyDown(document, { key: "r" });

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: "Run history" }),
			).toBeInTheDocument();
		});
	});

	it("stays put when r is pressed without its g prefix", async () => {
		renderShellAt("/corpus", { runs: 0, corpusFiles: 137 });

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: "Instruction corpus" }),
			).toBeInTheDocument();
		});

		fireEvent.keyDown(document, { key: "r" });

		await navigationWouldHaveLanded();

		expect(
			screen.queryByRole("heading", { name: "Run history" }),
		).not.toBeInTheDocument();
	});

	it("leaves the chord alone while the operator is typing in a field", async () => {
		renderShellAt("/corpus", { runs: 0, corpusFiles: 137 });

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: "Instruction corpus" }),
			).toBeInTheDocument();
		});

		const field = document.createElement("input");
		document.body.append(field);
		field.focus();

		fireEvent.keyDown(field, { key: "g" });
		fireEvent.keyDown(field, { key: "r" });

		await navigationWouldHaveLanded();

		expect(
			screen.queryByRole("heading", { name: "Run history" }),
		).not.toBeInTheDocument();

		field.remove();
	});

	it("answers an unknown address inside the shell, naming it", async () => {
		renderShellAt("/tasks", { runs: 0, corpusFiles: 137 });

		await waitFor(() => {
			expect(
				screen.getByRole("navigation", { name: "Sections" }),
			).toBeInTheDocument();
		});

		expect(
			screen.getByRole("region", { name: "Corpus under test" }),
		).toBeInTheDocument();
		expect(screen.getByText(/\/tasks/u)).toBeInTheDocument();
		expect(screen.queryByText("Not Found")).not.toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: /Back to run history/u }),
		).toHaveAttribute("href", "/");
	});

	it("names the corpus under test on every screen", async () => {
		renderShellAt("/", { runs: 0, corpusFiles: 137 });

		const card = await screen.findByRole("region", {
			name: "Corpus under test",
		});

		await waitFor(() => {
			expect(within(card).getByText("corpus root@ffd58d")).toBeInTheDocument();
		});
		expect(within(card).getByText("137 files")).toBeInTheDocument();
		expect(screen.queryByText("corpus@ffd58d")).not.toBeInTheDocument();
	});

	it.each(["/", "/corpus", "/system", "/runs/run-a/stages/build"])(
		"names the corpus under test on %s",
		async (path) => {
			renderShellAt(path, { runs: 0, corpusFiles: 137 });

			const card = await screen.findByRole("region", {
				name: "Corpus under test",
			});

			await waitFor(() => {
				expect(
					within(card).getByText("corpus root@ffd58d"),
				).toBeInTheDocument();
			});
		},
	);

	it("says the corpus could not be read when its request fails", async () => {
		stubFetchFailing("/api/corpus");
		renderAppAt("/");

		const card = await screen.findByRole("region", {
			name: "Corpus under test",
		});

		await waitFor(() => {
			expect(within(card).getByRole("alert")).toHaveTextContent(
				/Could not read the corpus/u,
			);
		});
		expect(
			within(card).queryByText(/Reading the corpus/u),
		).not.toBeInTheDocument();
	});

	it("withholds the digest in words when a file refused hashing", async () => {
		stubFetchByPath(
			new Map<string, unknown>([
				["/api/runs", { rows: [], unreadable: [] }],
				[
					"/api/corpus",
					{
						root: "/corpus",
						files: [corpusFile("CLAUDE.md")],
						refusals: ["skills/a resolves outside the corpus source"],
					},
				],
			]),
		);
		renderAppAt("/");

		const card = await screen.findByRole("region", {
			name: "Corpus under test",
		});

		await waitFor(() => {
			expect(within(card).getByText(/withheld/u)).toBeInTheDocument();
		});
		expect(within(card).getByText(/1 refusal/u)).toBeInTheDocument();
		expect(within(card).queryByText(/corpus root@/u)).not.toBeInTheDocument();
	});

	it.each([
		[4, 137],
		[2, 9],
	])(
		"badges run history with %s and corpus with %s, each its own collection",
		async (runs, corpusFiles) => {
			renderShellAt("/", { runs, corpusFiles });

			await waitFor(() => {
				expect(
					screen.getByRole("link", { name: `Run history ${runs}` }),
				).toBeInTheDocument();
			});
			expect(
				screen.getByRole("link", { name: `Corpus ${corpusFiles}` }),
			).toBeInTheDocument();
		},
	);

	it("navigates between run history and corpus by click", async () => {
		renderShellAt("/");

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: "Run history" }),
			).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole("link", { name: /Corpus/u }));

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: "Instruction corpus" }),
			).toBeInTheDocument();
		});

		fireEvent.click(screen.getByRole("link", { name: /Run history/u }));

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: "Run history" }),
			).toBeInTheDocument();
		});
	});

	it("marks the open screen's own section as the current page", async () => {
		renderShellAt("/corpus");

		await waitFor(() => {
			expect(
				screen.getByRole("heading", { name: "Instruction corpus" }),
			).toBeInTheDocument();
		});

		expect(screen.getByRole("link", { name: /Corpus/u })).toHaveAttribute(
			"aria-current",
			"page",
		);
		expect(
			screen.getByRole("link", { name: /Run history/u }),
		).not.toHaveAttribute("aria-current");
	});

	it("says in words that a section without a screen is planned", async () => {
		renderShellAt("/");

		await waitFor(() => {
			expect(
				screen.getByRole("navigation", { name: "Sections" }),
			).toBeInTheDocument();
		});

		const planned = screen.getAllByText("planned");

		expect(planned).toHaveLength(7);
	});

	it.each(["/", "/corpus", "/system", "/runs/run-a/stages/build", "/tasks"])(
		"gives %s one main landmark, the shell's own",
		async (path) => {
			renderShellAt(path, { runs: 0, corpusFiles: 137 });

			await screen.findByRole("navigation", { name: "Sections" });

			await waitFor(() => {
				expect(screen.getAllByRole("main")).toHaveLength(1);
			});
		},
	);

	it("sends every live nav item and chord to a route the router serves", () => {
		const served = new Set<string>(
			Object.values(createAppRouter().routesById).map(
				(route) => route.fullPath,
			),
		);
		const destinations: string[] = [
			...NAV_ITEMS.map((item) => item.path).filter(
				(path) => path !== undefined,
			),
			...CHORD_DESTINATIONS.values(),
		];

		expect(destinations.length).toBeGreaterThan(0);
		for (const path of destinations) {
			expect(served.has(path)).toBe(true);
		}
	});

	it("gives the comparison screen one main landmark too", async () => {
		const digest = "e".repeat(64);
		stubFetchByPath(
			new Map<string, unknown>([
				["/api/runs", { rows: [], unreadable: [] }],
				[
					"/api/corpus",
					{ root: "/corpus", digest: "ffd58d", files: [], refusals: [] },
				],
				[
					`/api/comparisons/${digest}`,
					{ report: { cases: [] }, attribution: {} },
				],
			]),
		);
		renderAppAt(`/comparisons/${digest}`);

		await screen.findByRole("navigation", { name: "Sections" });

		await waitFor(() => {
			expect(screen.getAllByRole("main")).toHaveLength(1);
		});
	});

	it("leads from the landing screen to the corpus screen", async () => {
		renderShellAt("/");

		await waitFor(() => {
			expect(screen.getByRole("link", { name: /Corpus/u })).toHaveAttribute(
				"href",
				"/corpus",
			);
		});
	});
});
