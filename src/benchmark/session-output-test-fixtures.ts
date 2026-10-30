/**
 * The init message a session with no MCP server and no plugin reports, which
 * `--output-format stream-json --verbose` writes before every other message.
 */
const BARE_INIT = JSON.stringify({
	mcp_servers: [],
	plugins: [],
	subtype: "init",
	type: "system",
});

/**
 * What a session run with `--output-format stream-json --verbose` writes, from
 * the text of its result message and of its init message, a message a line.
 */
function verboseOutput(result: string, init: string = BARE_INIT): string {
	return `${init}\n${result}`;
}

export { verboseOutput as default };
