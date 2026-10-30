import { describe, expect, it } from "bun:test";

import { readSessionOutput } from "./session-output";

const RESULT = {
	is_error: false,
	result: "OK",
	session_id: "s",
	total_cost_usd: 0.01,
	type: "result",
};

const BARE_INIT = JSON.stringify({
	mcp_servers: [],
	subtype: "init",
	type: "system",
});

function messages(...lines: readonly string[]): string {
	return lines.join("\n");
}

function readsTheResultMessageAsTheEnvelope(): void {
	const output = messages(
		BARE_INIT,
		JSON.stringify({ type: "assistant" }),
		JSON.stringify(RESULT),
	);

	const { envelope } = readSessionOutput(output);

	expect(JSON.parse(envelope)).toEqual(RESULT);
}

function readsTheResultPastLinesThatAreNoMessage(): void {
	const output = messages(
		BARE_INIT,
		JSON.stringify({ uuid: "no type" }),
		"not json",
		JSON.stringify(RESULT),
	);

	const { envelope } = readSessionOutput(output);

	expect(JSON.parse(envelope)).toEqual(RESULT);
}

function namesTheMCPServersAndPluginsTheInitEventReports(): void {
	const init = JSON.stringify({
		mcp_servers: [
			{ name: "linear", status: "connected" },
			{ name: "Zeta", status: "needs-auth" },
		],
		plugins: [
			{ name: "zeta", path: "/home/user/.claude/plugins/zeta" },
			{ name: "Alpha", path: "/home/user/.claude/plugins/alpha" },
		],
		subtype: "init",
		type: "system",
	});

	const { loaded } = readSessionOutput(messages(init, JSON.stringify(RESULT)));

	expect(loaded).toEqual({
		mcpServers: [
			{ name: "Zeta", status: "needs-auth" },
			{ name: "linear", status: "connected" },
		],
		plugins: ["Alpha", "zeta"],
	});
}

function keepsEveryReadableEntryOfAnInitEventWithOneItCannotRead(): void {
	const init = JSON.stringify({
		mcp_servers: [{ name: "linear" }, { status: "connected" }],
		plugins: [{ name: "alpha" }, { path: "/home/user/plugins/unnamed" }],
		subtype: "init",
		type: "system",
	});

	const { loaded } = readSessionOutput(messages(init, JSON.stringify(RESULT)));

	expect(loaded).toEqual({
		mcpServers: [{ name: "linear" }],
		plugins: ["alpha"],
	});
}

function keepsNoValueTheInitEventCarriesBesideTheNames(): void {
	const init = JSON.stringify({
		cwd: "/home/user/SENTINEL",
		mcp_servers: [{ name: "linear", status: "connected", url: "SENTINEL" }],
		plugins: [{ name: "alpha", path: "/home/user/SENTINEL" }],
		subtype: "init",
		type: "system",
	});

	const { loaded } = readSessionOutput(messages(init, JSON.stringify(RESULT)));

	expect(JSON.stringify(loaded)).not.toContain("SENTINEL");
}

function readsAHaltedSessionSResultMessage(): void {
	const halted = { ...RESULT, is_error: true };

	const { envelope } = readSessionOutput(
		messages(BARE_INIT, JSON.stringify(halted)),
	);

	expect(JSON.parse(envelope)).toEqual(halted);
}

function readsWhatASessionCutOffBeforeItsResultLoaded(): void {
	const reading = readSessionOutput(messages(BARE_INIT, '{"type":"assis'));

	expect(reading).toEqual({
		envelope: "",
		loaded: { mcpServers: [], plugins: [] },
	});
}

function readsAnEmptyEnvelopeAndNoSetupFromOutputThatIsNotJSON(): void {
	const reading = readSessionOutput("Error: spawn failed");

	expect(reading).toEqual({ envelope: "", loaded: undefined });
}

describe(readSessionOutput.name, () => {
	it(
		"reads the result message as the envelope",
		readsTheResultMessageAsTheEnvelope,
	);
	it(
		"reads the result past lines that are no message",
		readsTheResultPastLinesThatAreNoMessage,
	);
	it(
		"names the MCP servers and plugins the init event reports",
		namesTheMCPServersAndPluginsTheInitEventReports,
	);
	it(
		"keeps every readable entry of an init event with one it cannot read",
		keepsEveryReadableEntryOfAnInitEventWithOneItCannotRead,
	);
	it(
		"keeps no value the init event carries beside the names",
		keepsNoValueTheInitEventCarriesBesideTheNames,
	);
	it(
		"reads a halted session's result message",
		readsAHaltedSessionSResultMessage,
	);
	it(
		"reads what a session cut off before its result loaded",
		readsWhatASessionCutOffBeforeItsResultLoaded,
	);
	it(
		"reads an empty envelope and no setup from output that is not JSON",
		readsAnEmptyEnvelopeAndNoSetupFromOutputThatIsNotJSON,
	);
});
