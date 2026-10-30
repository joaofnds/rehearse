import { z } from "zod";

import type { Immutable } from "./contracts";
import parseJsonDocument from "./json-document";
import type { loadedSetupSchema } from "./session-record-context-schema";

type LoadedSetup = Immutable<z.infer<typeof loadedSetupSchema>>;

/** What `--output-format json --verbose` writes: every message, ending on the result. */
interface SessionOutput {
	/** The result message, the one envelope a session without `--verbose` writes. */
	readonly envelope: string;
	readonly loaded: LoadedSetup | undefined;
}

const messagesSchema = z.array(z.looseObject({ type: z.string() }));

const initServerSchema = z.looseObject({
	name: z.string().nonempty(),
	status: z.string().nonempty(),
});

const initPluginSchema = z.looseObject({ name: z.string().nonempty() });

const initSchema = z.looseObject({
	mcp_servers: z.array(initServerSchema),
	plugins: z.array(initPluginSchema).optional(),
	subtype: z.literal("init"),
	type: z.literal("system"),
});

function loadedSetup(
	messages: Immutable<z.infer<typeof messagesSchema>>,
): LoadedSetup | undefined {
	const init = messages
		.map((message) => initSchema.safeParse(message))
		.find((parsed) => parsed.success);
	if (init === undefined) {
		return undefined;
	}

	return {
		mcpServers: init.data.mcp_servers
			.map(({ name, status }) => ({ name, status }))
			.toSorted((left, right) => left.name.localeCompare(right.name)),
		plugins: (init.data.plugins ?? []).map(({ name }) => name).toSorted(),
	};
}

function readMessages(
	output: string,
): Immutable<z.infer<typeof messagesSchema>> {
	const document = parseJsonDocument(output, messagesSchema);
	if (document.kind === "invalid-json" || !document.parsed.success) {
		return [];
	}

	return document.parsed.data;
}

function resultEnvelope(
	messages: Immutable<z.infer<typeof messagesSchema>>,
): string | undefined {
	const result = messages.findLast((message) => message.type === "result");

	return result === undefined ? undefined : JSON.stringify(result);
}

function readSessionOutput(output: string): SessionOutput {
	const messages = readMessages(output);
	const envelope = resultEnvelope(messages);
	if (envelope === undefined) {
		throw new Error("Claude session output ended without a result");
	}

	return { envelope, loaded: loadedSetup(messages) };
}

/**
 * A failed session's output, which may hold no messages at all. The envelope
 * is empty then, as a failed command's stdout is.
 */
function readFailedSessionOutput(output: string): SessionOutput {
	const messages = readMessages(output);

	return {
		envelope: resultEnvelope(messages) ?? "",
		loaded: loadedSetup(messages),
	};
}

export { readFailedSessionOutput, readSessionOutput };
export type { LoadedSetup, SessionOutput };
