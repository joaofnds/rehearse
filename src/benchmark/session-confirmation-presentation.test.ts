import { describe, expect, it } from "bun:test";

import { runList } from "#cli/list-command";
import { runShow } from "#cli/show-command";

import { runSessionConfirmation } from "./session-confirmation";
import confirmationEvidence from "./session-confirmation-evidence-test-fixtures";
import { frozenSessionScenario } from "./session-confirmation-provider-test-fixtures";

async function totalsTheCommandResourcesAcrossPreflightAndReps(): Promise<void> {
	const scenario = await frozenSessionScenario();

	const outcome = await runSessionConfirmation(
		scenario.dependencies,
		scenario.request,
	);
	const { report } = await confirmationEvidence(outcome);

	expect(report.resources.commandTotal).toEqual({
		metrics: {
			cacheReadTokens: 12,
			cacheWriteTokens: 16,
			costUsd: 0.08,
			inputTokens: 40,
			outputTokens: 8,
		},
		status: "COMPLETE",
	});
}
async function listsTheSessionConfirmationGroup(): Promise<void> {
	const scenario = await frozenSessionScenario();

	await runSessionConfirmation(scenario.dependencies, scenario.request);
	const listed: string[] = [];

	await runList(
		{ kind: "groups", runsDirectory: scenario.request.runsDirectory },
		{
			stderr: (message) => {
				expect.unreachable(message);
			},
			stdout: (text) => {
				listed.push(text);
			},
		},
	);
	expect(listed.join("")).toContain("group:session-group\tsmoke/g1\t");
}
async function showsTheSessionConfirmationSummary(): Promise<void> {
	const scenario = await frozenSessionScenario();

	await runSessionConfirmation(scenario.dependencies, scenario.request);
	const shown: string[] = [];

	await runShow(
		{
			id: "group:session-group",
			json: false,
			runsDirectory: scenario.request.runsDirectory,
		},
		{
			stderr: (message) => {
				expect.unreachable(message);
			},
			stdout: (text) => {
				shown.push(text);
			},
		},
	);
	expect(shown.join("")).toContain("Case smoke, session mode, 3 reps.");
	expect(shown.join("")).toContain("Cost $0.08 for the confirmed command.");
}
async function showsTheSessionConfirmationJSON(): Promise<void> {
	const scenario = await frozenSessionScenario();

	await runSessionConfirmation(scenario.dependencies, scenario.request);
	const shownJson: string[] = [];

	await runShow(
		{
			id: "group:session-group",
			json: true,
			runsDirectory: scenario.request.runsDirectory,
		},
		{
			stderr: (message) => {
				expect.unreachable(message);
			},
			stdout: (text) => {
				shownJson.push(text);
			},
		},
	);
	expect(JSON.parse(shownJson.join(""))).toMatchObject({
		mode: "session",
		schemaVersion: 2,
	});
}
describe(runSessionConfirmation.name, () => {
	it(
		"totals the command resources across preflight and reps",
		totalsTheCommandResourcesAcrossPreflightAndReps,
	);
	it("lists the session confirmation group", listsTheSessionConfirmationGroup);
	it(
		"shows the session confirmation summary",
		showsTheSessionConfirmationSummary,
	);
	it("shows the session confirmation JSON", showsTheSessionConfirmationJSON);
});
