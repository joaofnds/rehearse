import { chmod, mkdir } from "node:fs/promises";
import { join } from "node:path";

import { EXECUTABLE_PERMISSIONS } from "#server/file-permissions-test-support";

const FREE_CALL_COST_USD = 0;

/**
 * A `claude` earlier on PATH than the real one, so a pipeline run reaches its
 * stages without a paid call. `runCommand` spreads `Bun.env` into every child,
 * so anything named `claude` ahead of the provider shadows it for the whole
 * process tree, which is why the shim stays in a directory the test removes.
 */
const PROVIDER_CALLS_LOG = "provider-calls.log";

async function providerCallsIn(binDirectory: string): Promise<boolean> {
	return await Bun.file(join(binDirectory, PROVIDER_CALLS_LOG)).exists();
}

interface ProviderShimFixtureInput {
	readonly directory: string;
	readonly callCostUsd?: number | undefined;
	readonly onCall?: readonly string[] | undefined;
}

async function providerShim({
	directory,
	callCostUsd = FREE_CALL_COST_USD,
	onCall = [],
}: ProviderShimFixtureInput): Promise<string> {
	const binDirectory = join(directory, "bin");
	await mkdir(binDirectory, { recursive: true });
	const shim = join(binDirectory, "claude");
	const envelope = JSON.stringify({
		duration_api_ms: 1,
		duration_ms: 1,
		is_error: false,
		num_turns: 1,
		result: JSON.stringify({ message: "done", status: "COMPLETE" }),
		session_id: "fake",
		subtype: "success",
		total_cost_usd: callCostUsd,
		type: "result",
		usage: {
			cache_creation_input_tokens: 0,
			cache_read_input_tokens: 0,
			input_tokens: 1,
			output_tokens: 1,
		},
	});
	await Bun.write(
		shim,
		[
			"#!/bin/sh",
			'for argument in "$@"; do',
			'\tcase "$argument" in',
			"\t\t--version) echo '1.0.0 (Claude Code)'; exit 0 ;;",
			"\t\t--help) echo '--print --model --settings --append-system-prompt --permission-mode --allowedTools --add-dir --output-format --session-id --resume --strict-mcp-config --mcp-config --agents'; exit 0 ;;",
			"\tesac",
			"done",
			`printf '%s\\n' "$*" >> '${join(binDirectory, PROVIDER_CALLS_LOG)}'`,
			...onCall,
			"cat >/dev/null",
			`cat <<'ENVELOPE'`,
			envelope,
			"ENVELOPE",
			"",
		].join("\n"),
	);
	await chmod(shim, EXECUTABLE_PERMISSIONS);

	return binDirectory;
}

/**
 * A `docker` earlier on PATH than the real one, so a run starts its target's
 * services without starting a container. Every service is ready at once and
 * publishes the same port, and the shim lists the containers it started and
 * those it removed beside itself.
 */
const STAND_IN_PORT = 54_321;

const STAND_IN_DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${STAND_IN_PORT}/template`;

const STARTED_CONTAINERS = "containers-started.log";

const REMOVED_CONTAINERS = "containers-removed.log";

async function containerShim(binDirectory: string): Promise<void> {
	const shim = join(binDirectory, "docker");
	const started = join(binDirectory, STARTED_CONTAINERS);
	await Bun.write(
		shim,
		[
			"#!/bin/sh",
			'case "$1" in',
			"run)",
			'\tfor argument in "$@"; do',
			'\t\tcase "$argument" in rehearse.service=*) service=$(echo "$argument" | cut -d = -f 2) ;; esac',
			"\tdone",
			`\tprintf 'container-%s %s\\n' "$service" "$service" >> '${started}'`,
			"\tprintf 'container-%s\\n' \"$service\" ;;",
			`port) echo '127.0.0.1:${STAND_IN_PORT}' ;;`,
			"exec) ;;",
			`ps) cat '${started}' 2>/dev/null || true ;;`,
			`rm) printf '%s\\n' "$3" >> '${join(binDirectory, REMOVED_CONTAINERS)}' ;;`,
			"esac",
			"",
		].join("\n"),
	);
	await chmod(shim, EXECUTABLE_PERMISSIONS);
}

/** A shell line appending the database address its process was given to a file in `directory`. */
function recordDatabaseAddress(directory: string, file: string): string {
	return `printf '%s\\n' "$DATABASE_URL" >> '${join(directory, file)}'`;
}

async function sawDatabaseAddress(
	directory: string,
	file: string,
): Promise<boolean> {
	const lines = await linesIn(join(directory, file));

	return lines.includes(STAND_IN_DATABASE_URL);
}

async function linesIn(file: string): Promise<readonly string[]> {
	const text = await Bun.file(file).text();

	return text.trimEnd().split("\n");
}

export {
	containerShim,
	linesIn,
	PROVIDER_CALLS_LOG,
	providerCallsIn,
	providerShim,
	recordDatabaseAddress,
	REMOVED_CONTAINERS,
	sawDatabaseAddress,
};
