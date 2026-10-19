import type { InferResponseType } from "hono/client";

import type { SessionHistoryReport } from "#benchmark/session-history";
import { apiClient } from "#client/api-client";
import type HTTP_STATUS from "#client/http-status";

import type { SessionHistoryIdentity } from "./history-investigation-contract";

function summaryPath(identity: SessionHistoryIdentity): string {
	if (identity.kind === "standalone") {
		return `/api/attempts/session/${encodeURIComponent(identity.caseId)}/${encodeURIComponent(identity.uuid)}/history`;
	}

	if (identity.kind === "stage") {
		return `/api/runs/${encodeURIComponent(identity.run)}/stages/${encodeURIComponent(identity.stage)}/history`;
	}

	if (identity.kind === "replay") {
		return `/api/replays/${encodeURIComponent(identity.lineage)}/${encodeURIComponent(identity.timestamp)}/history`;
	}

	return `/api/groups/${encodeURIComponent(identity.groupId)}/reps/${encodeURIComponent(identity.repId)}/attempt/history`;
}

async function fetchSummary(
	identity: SessionHistoryIdentity,
): Promise<SessionHistoryReport> {
	const requestSummary = async (): ReturnType<
		(typeof apiClient.api.attempts.session)[":caseId"][":uuid"]["history"]["$get"]
	> => {
		if (identity.kind === "standalone") {
			return await apiClient.api.attempts.session[":caseId"][
				":uuid"
			].history.$get({
				param: { caseId: identity.caseId, uuid: identity.uuid },
			});
		} else if (identity.kind === "stage") {
			return await apiClient.api.runs[":run"].stages[":stage"].history.$get({
				param: { run: identity.run, stage: identity.stage },
			});
		} else if (identity.kind === "replay") {
			return await apiClient.api.replays[":lineage"][":timestamp"].history.$get(
				{
					param: {
						lineage: encodeURIComponent(identity.lineage),
						timestamp: encodeURIComponent(identity.timestamp),
					},
				},
			);
		}
		return await apiClient.api.groups[":groupId"].reps[
			":repId"
		].attempt.history.$get({
			param: { groupId: identity.groupId, repId: identity.repId },
		});
	};
	const response = await requestSummary();
	if (!response.ok) {
		throw new Error(`Request failed with ${response.status}`);
	}

	return await response.json();
}

interface SessionHistoryQuery {
	readonly queryKey: readonly ["session-history", string];
	readonly queryFn: () => Promise<SessionHistoryReport>;
}

function sessionHistoryQuery(
	identity: SessionHistoryIdentity,
): SessionHistoryQuery {
	return {
		queryFn: async () => await fetchSummary(identity),
		queryKey: ["session-history", summaryPath(identity)],
	};
}

/**
 * The response type comes from the route rather than from the reader's own
 * interface: JSON widens an optional field to admit an explicit undefined,
 * so the decoded shape is not the domain type and asserting it were would
 * hide exactly that difference.
 */
type RequestSeriesResponse = InferResponseType<
	(typeof apiClient.api.attempts.session)[":caseId"][":uuid"]["history"]["requests"]["$get"],
	typeof HTTP_STATUS.ok
>;

async function fetchRequestSeries(
	identity: SessionHistoryIdentity,
): Promise<RequestSeriesResponse> {
	if (identity.kind === "stage" || identity.kind === "replay") {
		throw new Error("A saved stage records no request series");
	}
	const response =
		identity.kind === "standalone"
			? await apiClient.api.attempts.session[":caseId"][
					":uuid"
				].history.requests.$get({
					param: { caseId: identity.caseId, uuid: identity.uuid },
				})
			: await apiClient.api.groups[":groupId"].reps[
					":repId"
				].attempt.history.requests.$get({
					param: { groupId: identity.groupId, repId: identity.repId },
				});
	if (!response.ok) {
		throw new Error(`Request failed with ${response.status}`);
	}

	return await response.json();
}

export { fetchRequestSeries, sessionHistoryQuery, summaryPath };
export type { RequestSeriesResponse };
