import { z } from "zod";

import { streamResultLine } from "./claude";
import type { Immutable } from "./contracts";
import parseJsonDocument from "./json-document";
import type { loadedSetupSchema } from "./session-record-context-schema";

type LoadedSetup = Immutable<z.infer<typeof loadedSetupSchema>>;

interface SessionOutput {
	/** The result line, the one envelope a `json` session writes, or empty. */
	readonly envelope: string;
	readonly loaded: LoadedSetup | undefined;
}

const initServerSchema = z.looseObject({
	name: z.string().nonempty(),
	status: z.string().nonempty().optional(),
});

const initPluginSchema = z.looseObject({ name: z.string().nonempty() });

/**
 * Entries are read one by one, so an entry a later Claude Code shapes
 * differently costs that entry rather than the whole record.
 */
const initSchema = z.looseObject({
	mcp_servers: z.array(z.unknown()).optional(),
	plugins: z.array(z.unknown()).optional(),
	subtype: z.literal("init"),
	type: z.literal("system"),
});

function readable<T>(
	entries: readonly unknown[] | undefined,
	schema: z.ZodType<T>,
): T[] {
	return (entries ?? []).flatMap((entry) => {
		const parsed = schema.safeParse(entry);

		return parsed.success ? [parsed.data] : [];
	});
}

/** Code-unit order, as `toSorted` gives the names the setup files list. */
function byName(
	left: Readonly<{ name: string }>,
	right: Readonly<{ name: string }>,
): number {
	return Number(left.name > right.name) - Number(left.name < right.name);
}

const messageSchema = z.looseObject({ type: z.string() });

function isMessage(line: string): boolean {
	const document = parseJsonDocument(line, messageSchema);

	return document.kind !== "invalid-json" && document.parsed.success;
}

/** Whether any line of the output is a message, rather than a diagnostic. */
function carriesMessages(output: string): boolean {
	return output.split("\n").some((line) => isMessage(line));
}

function initMessage(line: string): z.infer<typeof initSchema> | undefined {
	const document = parseJsonDocument(line, initSchema);

	return document.kind === "invalid-json" || !document.parsed.success
		? undefined
		: document.parsed.data;
}

function loadedSetup(output: string): LoadedSetup | undefined {
	const init = output
		.split("\n")
		.map((line) => initMessage(line))
		.find((message) => message !== undefined);
	if (init === undefined) {
		return undefined;
	}

	const servers = readable(init.mcp_servers, initServerSchema);

	return {
		mcpServers: servers
			.map(({ name, status }) =>
				status === undefined ? { name } : { name, status },
			)
			.toSorted(byName),
		plugins: readable(init.plugins, initPluginSchema)
			.map(({ name }) => name)
			.toSorted(),
	};
}

/**
 * What `--output-format stream-json --verbose` writes, a message a line. A
 * session cut off before its result still names what it loaded.
 */
function readSessionOutput(output: string): SessionOutput {
	return {
		envelope: streamResultLine(output) ?? "",
		loaded: loadedSetup(output),
	};
}

export { carriesMessages, readSessionOutput };
export type { LoadedSetup };
