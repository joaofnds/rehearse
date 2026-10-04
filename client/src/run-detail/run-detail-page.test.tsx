import { afterEach, describe, expect, it } from "bun:test";
import { screen, within } from "@testing-library/react";
import { LiveReply } from "#client/test-support/live-reply";
import { renderAppWithStub } from "#client/test-support/render-app";
import { recordStage, runRecord } from "#client/test-support/run-record";
import { runRow } from "#client/test-support/runs-in-flight";
import {
	CORPUS,
	history,
	judgedRow,
	judgedStaleness,
	RUN,
	renderRunDetail,
	serveRunDetail,
	stoppedAtBuild,
	stoppedRow,
} from "./run-detail-fixtures";

const originalFetch = globalThis.fetch;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("/runs/$run", () => {
	it("names the run, its case and how it ended in the header", async () => {
		renderRunDetail();

		const heading = await screen.findByRole("heading", { level: 1 });
		const header = heading.closest("header");

		expect(heading).toHaveTextContent("r-0147");
		expect(heading).toHaveTextContent("audit-log");
		expect(header).toHaveTextContent("stopped at step 2 · below minimum B");
		expect(header).toHaveTextContent("corpus@a41c7e");
	});

	it("reads the run record again when a live run moves to its next step", async () => {
		let running = "build";
		const records = new Map([
			[
				"build",
				runRecord({
					run: RUN,
					running: "build",
					stages: [
						recordStage("shape", { status: "graded" }),
						recordStage("build"),
						recordStage("verify"),
					],
				}),
			],
			[
				"verify",
				runRecord({
					run: RUN,
					running: "verify",
					stages: [
						recordStage("shape", { status: "graded" }),
						recordStage("build", { status: "graded" }),
						recordStage("verify"),
					],
				}),
			],
		]);
		serveRunDetail(
			new Map([
				[
					"GET /api/runs",
					new LiveReply(() => ({
						status: 200,
						body: history([runRow({ run: RUN, stage: running })]),
					})),
				],
				[
					`GET /api/runs/${RUN}`,
					new LiveReply(() => ({ status: 200, body: records.get(running) })),
				],
			]),
		);

		expect(
			await screen.findByRole("button", { name: /^Replay step 1/u }),
		).toBeInTheDocument();
		running = "verify";

		expect(
			await screen.findByRole(
				"button",
				{ name: /^Replay step 2/u },
				{ timeout: 5000 },
			),
		).toBeInTheDocument();
	});

	it("offers the Contribution layout, pressed, and a replay of the step it stopped at", async () => {
		renderRunDetail();

		const switcher = await screen.findByRole("group", {
			name: "Run detail layout",
		});

		expect(
			within(switcher).getByRole("button", { name: "Contribution" }),
		).toHaveAttribute("aria-pressed", "true");
		expect(
			screen.getByRole("button", { name: "Replay step 2" }),
		).toBeInTheDocument();
	});

	it("says a stopped run's repository was restored and which checkpoints remain", async () => {
		renderRunDetail();

		expect(
			await screen.findByText(
				"Repository restored to acme-api @ e91f2a. Checkpoints from step 1 are retained and replayable.",
			),
		).toBeInTheDocument();
	});

	it("grades the task on its own and never shows a letter the final judge did not return", async () => {
		renderRunDetail();

		const card = await screen.findByRole("region", {
			name: "Task grade · graded on its own",
		});

		expect(card).toHaveTextContent(
			"not reached · the run stopped before the final judge",
		);
		expect(card).toHaveTextContent(
			"It does not read the intermediate steps, so it cannot grade a run that stopped early.",
		);
		expect(within(card).queryByText(/^[A-F][+-]?$/u)).not.toBeInTheDocument();
	});

	it.each([
		[{ status: "JUDGED", verdict: "PASS" }, "PASS", "graded independently"],
		[
			{ status: "JUDGING_FAILED", reason: "the judge timed out" },
			"—",
			"judging failed · the judge timed out",
		],
		[
			{ status: "PENDING", stage: "verify" },
			"—",
			"pending · the run is at verify",
		],
		[
			{ status: "NOT_REACHED", stage: "verify", reason: "the run stopped" },
			"—",
			"not reached · the run stopped",
		],
	] as const)(
		"reads a %o final outcome as its verdict or a dash with the reason",
		async (finalOutcome, value, note) => {
			renderRunDetail(
				new Map([[`/api/runs/${RUN}`, { ...stoppedAtBuild(), finalOutcome }]]),
			);

			const card = await screen.findByRole("region", {
				name: "Task grade · graded on its own",
			});

			expect(within(card).getByText(value)).toBeInTheDocument();
			expect(within(card).getByText(note)).toBeInTheDocument();
		},
	);

	it("shows no restore line for a run that completed", async () => {
		renderAppWithStub(
			`/runs/${RUN}`,
			new Map<string, unknown>([
				["/api/runs", history([{ ...stoppedRow(), status: "SUCCESSFUL" }])],
				[`/api/runs/${RUN}`, stoppedAtBuild()],
			]),
		);

		expect(
			await screen.findByText(
				"Layout C · task grade first, then the culprit pass",
			),
		).toBeInTheDocument();
		expect(screen.queryByText(/Repository restored/u)).not.toBeInTheDocument();
	});

	it("shows the last task grade recorded for the same case, with its staleness and why it is not comparable", async () => {
		renderRunDetail(new Map(), [
			judgedRow(
				"2026-09-20T09-00-00.000Z",
				"r-0141",
				"FAIL",
				"1d2e3f".padEnd(64, "0"),
			),
			judgedRow(
				"2026-09-25T09-00-00.000Z",
				"r-0144",
				"PASS",
				"9f30d1".padEnd(64, "0"),
				judgedStaleness(true),
			),
			{
				...judgedRow("2026-09-26T09-00-00.000Z", "r-0145", "PASS", CORPUS),
				caseId: "other-case",
			},
		]);

		const last = await screen.findByRole("region", {
			name: "Last task grade for this case",
		});

		expect(last).toHaveTextContent("PASS");
		expect(last).toHaveTextContent("r-0144");
		expect(last).toHaveTextContent("stale · corpus@9f30d1");
		expect(last).toHaveTextContent("Not comparable to a corpus@a41c7e result.");
	});

	it("reads a last task grade on another corpus as clean when the server judged it so", async () => {
		renderRunDetail(new Map(), [
			judgedRow(
				"2026-09-30T09-00-00.000Z",
				"r-0150",
				"PASS",
				"9f30d1".padEnd(64, "0"),
			),
		]);

		const last = await screen.findByRole("region", {
			name: "Last task grade for this case",
		});

		expect(last).toHaveTextContent("clean · corpus@9f30d1");
		expect(last).not.toHaveTextContent("stale");
		expect(last).toHaveTextContent("Not comparable to a corpus@a41c7e result.");
	});

	it("says a last task grade on this run's corpus is comparable", async () => {
		renderRunDetail(new Map(), [
			judgedRow("2026-09-30T09-00-00.000Z", "r-0150", "FAIL", CORPUS),
		]);

		const last = await screen.findByRole("region", {
			name: "Last task grade for this case",
		});

		expect(last).toHaveTextContent("clean · corpus@a41c7e");
		expect(last).toHaveTextContent("same corpus as this run");
		expect(last).not.toHaveTextContent("Not comparable");
	});

	it("says the server did not judge a last task grade's staleness, with its reason", async () => {
		renderRunDetail(new Map(), [
			judgedRow("2026-09-30T09-00-00.000Z", "r-0150", "FAIL", CORPUS, {
				state: "unavailable",
				reasons: ["the corpus could not be read"],
			}),
		]);

		const last = await screen.findByRole("region", {
			name: "Last task grade for this case",
		});

		expect(last).toHaveTextContent(
			"corpus@a41c7e · staleness not judged: the corpus could not be read",
		);
		expect(last).not.toHaveTextContent("stale ·");
	});

	it("says when no other run of the case has a task grade", async () => {
		renderRunDetail();

		const last = await screen.findByRole("region", {
			name: "Last task grade for this case",
		});

		expect(last).toHaveTextContent(
			"No other run of this case has a task grade yet.",
		);
	});

	it("matches no other run as the same case when neither recorded a case", async () => {
		renderAppWithStub(
			`/runs/${RUN}`,
			new Map<string, unknown>([
				[
					"/api/runs",
					history([
						{ ...stoppedRow(), caseId: undefined },
						{
							...judgedRow(
								"2026-09-30T09-00-00.000Z",
								"r-0150",
								"PASS",
								CORPUS,
							),
							caseId: undefined,
						},
					]),
				],
				[`/api/runs/${RUN}`, stoppedAtBuild()],
			]),
		);

		const last = await screen.findByRole("region", {
			name: "Last task grade for this case",
		});

		expect(last).toHaveTextContent(
			"No other run of this case has a task grade yet.",
		);
	});

	it("says no recorded run has an id that run history does not list", async () => {
		renderAppWithStub(
			"/runs/2026-01-01T00-00-00.000Z",
			new Map([["/api/runs", history([stoppedRow()])]]),
		);

		expect(
			await screen.findByRole("heading", {
				name: "No recorded run has this id",
			}),
		).toBeInTheDocument();
	});
});
