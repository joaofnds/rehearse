import type { SessionHistoryDetail } from "#benchmark/session-history";
import { apiClient } from "#client/api-client";

import type { AgentsResponse, ExcerptRequest } from "./agent-tree-pane";
import { fetchDetail } from "./history-evidence-queries";
import type { SessionHistoryIdentity } from "./history-investigation-contract";

async function fetchAgents(
	identity: SessionHistoryIdentity,
): Promise<AgentsResponse> {
	if (identity.kind === "stage" || identity.kind === "replay") {
		throw new Error("Only a saved session attempt keeps its agents");
	}
	const response =
		identity.kind === "standalone"
			? await apiClient.api.attempts.session[":caseId"][
					":uuid"
				].history.agents.$get({
					param: { caseId: identity.caseId, uuid: identity.uuid },
				})
			: await apiClient.api.groups[":groupId"].reps[
					":repId"
				].attempt.history.agents.$get({
					param: { groupId: identity.groupId, repId: identity.repId },
				});
	if (!response.ok) {
		throw new Error(`Request failed with ${response.status}`);
	}

	return await response.json();
}

async function fetchAgentDetail(
	identity: SessionHistoryIdentity,
	agentId: string,
	eventId: string,
): Promise<SessionHistoryDetail> {
	if (identity.kind === "stage" || identity.kind === "replay") {
		throw new Error("Only a saved session attempt keeps its agents");
	}
	const response =
		identity.kind === "standalone"
			? await apiClient.api.attempts.session[":caseId"][":uuid"].history.agents[
					":agentId"
				][":eventId"].$get({
					param: {
						agentId,
						caseId: identity.caseId,
						eventId,
						uuid: identity.uuid,
					},
				})
			: await apiClient.api.groups[":groupId"].reps[
					":repId"
				].attempt.history.agents[":agentId"][":eventId"].$get({
					param: {
						agentId,
						eventId,
						groupId: identity.groupId,
						repId: identity.repId,
					},
				});
	if (!response.ok) {
		throw new Error(`Request failed with ${response.status}`);
	}

	return await response.json();
}

/** The root's events open through the attempt's own route. */
async function fetchExcerpt(
	identity: SessionHistoryIdentity,
	request: ExcerptRequest,
): Promise<SessionHistoryDetail> {
	return await (request.agentId === undefined
		? fetchDetail(identity, request.eventId)
		: fetchAgentDetail(identity, request.agentId, request.eventId));
}

interface AgentsQuery {
	readonly enabled: boolean;
	readonly queryKey: readonly ["session-history-agents", string];
	readonly queryFn: () => Promise<AgentsResponse>;
}

function agentsQuery(
	identity: SessionHistoryIdentity,
	path: string,
	recorded: boolean,
): AgentsQuery {
	return {
		enabled: recorded,
		queryFn: async () => await fetchAgents(identity),
		queryKey: ["session-history-agents", path],
	};
}

export { agentsQuery, fetchAgents, fetchExcerpt };
