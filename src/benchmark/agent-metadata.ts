import { z } from "zod";

import parseJsonDocument from "./json-document";

/**
 * The provider's name for the meta field saying whether the agent was launched
 * in the foreground or the background. It is the provider's key, kept as data
 * so that no name of this project's carries it.
 */
const PROVIDER_LAUNCH_MODE_KEY = "requestShape";

const metaSchema = z.looseObject({
	agentType: z.string().nonempty().optional(),
	description: z.string().optional(),
	parentAgentId: z.string().nonempty().optional(),
	spawnDepth: z.number().int().nonnegative().optional(),
	stoppedByUser: z.boolean().optional(),
	[PROVIDER_LAUNCH_MODE_KEY]: z.string().nonempty().optional(),
	toolUseId: z.string().nonempty().optional(),
});

/**
 * Whether the agent's meta file was read. An unreadable one is kept apart from
 * a missing one, since provider drift in one field fails the whole file.
 */
type AgentMetaState = "recorded" | "not recorded" | "unreadable";

interface AgentMeta {
	readonly state: AgentMetaState;
	readonly agentType?: string | undefined;
	readonly description?: string | undefined;
	readonly toolUseId?: string | undefined;
	readonly parentAgentId?: string | undefined;
	readonly spawnDepth?: number | undefined;
	readonly launchMode?: string | undefined;
	readonly stoppedByUser?: boolean | undefined;
}

function readMeta(text: string | undefined): AgentMeta {
	if (text === undefined) {
		return { state: "not recorded" };
	}

	const documentReading = parseJsonDocument(text, metaSchema);
	if (documentReading.kind === "invalid-json") {
		return { state: "unreadable" };
	}

	const { parsed: meta } = documentReading;
	if (!meta.success) {
		return { state: "unreadable" };
	}

	return {
		agentType: meta.data.agentType,
		description: meta.data.description,
		launchMode: meta.data[PROVIDER_LAUNCH_MODE_KEY],
		parentAgentId: meta.data.parentAgentId,
		spawnDepth: meta.data.spawnDepth,
		state: "recorded",
		stoppedByUser: meta.data.stoppedByUser,
		toolUseId: meta.data.toolUseId,
	};
}

export { readMeta as default };
export type { AgentMetaState, AgentMeta };
