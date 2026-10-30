import { describe, expect, it } from "bun:test";

import { readFailedSessionOutput, readSessionOutput } from "./session-output";

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
	return `[${lines.join(",")}]`;
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

function namesTheMCPServersAndPluginsTheInitEventReports(): void {
	const init = JSON.stringify({
		mcp_servers: [
			{ name: "linear", status: "connected" },
			{ name: "claude.ai Gmail", status: "needs-auth" },
		],
		plugins: [
			{ name: "zeta", path: "/home/user/.claude/plugins/zeta" },
			{ name: "alpha", path: "/home/user/.claude/plugins/alpha" },
		],
		subtype: "init",
		type: "system",
	});

	const { loaded } = readSessionOutput(messages(init, JSON.stringify(RESULT)));

	expect(loaded).toEqual({
		mcpServers: [
			{ name: "claude.ai Gmail", status: "needs-auth" },
			{ name: "linear", status: "connected" },
		],
		plugins: ["alpha", "zeta"],
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

function refusesOutputThatEndsWithoutAResult(): void {
	expect(() => readSessionOutput(messages(BARE_INIT))).toThrow(
		"Claude session output ended without a result",
	);
}

function readsTheResultMessageAHaltedSessionWrote(): void {
	const halted = { ...RESULT, is_error: true };

	const { envelope } = readFailedSessionOutput(
		messages(BARE_INIT, JSON.stringify(halted)),
	);

	expect(JSON.parse(envelope)).toEqual(halted);
}

function readsAnEmptyEnvelopeAndNoSetupFromOutputThatIsNotJSON(): void {
	const reading = readFailedSessionOutput("Error: spawn failed");

	expect(reading).toEqual({ envelope: "", loaded: undefined });
}

function describeWhenTheSessionFailed(): void {
	it(
		"reads the result message a halted session wrote",
		readsTheResultMessageAHaltedSessionWrote,
	);
	it(
		"reads an empty envelope and no setup from output that is not JSON",
		readsAnEmptyEnvelopeAndNoSetupFromOutputThatIsNotJSON,
	);
}

describe(readSessionOutput.name, () => {
	it(
		"reads the result message as the envelope",
		readsTheResultMessageAsTheEnvelope,
	);
	it(
		"names the MCP servers and plugins the init event reports",
		namesTheMCPServersAndPluginsTheInitEventReports,
	);
	it(
		"keeps no value the init event carries beside the names",
		keepsNoValueTheInitEventCarriesBesideTheNames,
	);
	it(
		"refuses output that ends without a result",
		refusesOutputThatEndsWithoutAResult,
	);
	describe("when the session failed", describeWhenTheSessionFailed);
});
