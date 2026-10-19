import type { InferResponseType } from "hono/client";

import type { SessionHistoryDetail } from "#benchmark/session-history";
import { apiClient } from "#client/api-client";
import type HTTP_STATUS from "#client/http-status";

import type { SessionHistoryIdentity } from "./history-investigation-contract";

type StageCorpusResponse = InferResponseType<
	(typeof apiClient.api.runs)[":run"]["stages"][":stage"]["history"]["corpus"]["$get"],
	typeof HTTP_STATUS.ok
>;

async function fetchStageCorpus(
	run: string,
	stage: string,
): Promise<StageCorpusResponse> {
	const response = await apiClient.api.runs[":run"].stages[
		":stage"
	].history.corpus.$get({ param: { run, stage } });
	if (!response.ok) {
		throw new Error(`Request failed with ${response.status}`);
	}

	return await response.json();
}

async function fetchDetail(
	identity: SessionHistoryIdentity,
	eventId: string,
): Promise<SessionHistoryDetail> {
	const requestDetail = async (): ReturnType<
		(typeof apiClient.api.attempts.session)[":caseId"][":uuid"]["history"][":eventId"]["$get"]
	> => {
		if (identity.kind === "standalone") {
			return await apiClient.api.attempts.session[":caseId"][":uuid"].history[
				":eventId"
			].$get({
				param: { caseId: identity.caseId, eventId, uuid: identity.uuid },
			});
		} else if (identity.kind === "stage") {
			return await apiClient.api.runs[":run"].stages[":stage"].history[
				":eventId"
			].$get({
				param: { eventId, run: identity.run, stage: identity.stage },
			});
		} else if (identity.kind === "replay") {
			throw new Error("A replay serves no per-event evidence detail");
		} else {
			return await apiClient.api.groups[":groupId"].reps[
				":repId"
			].attempt.history[":eventId"].$get({
				param: { eventId, groupId: identity.groupId, repId: identity.repId },
			});
		}
	};
	const response = await requestDetail();
	if (!response.ok) {
		throw new Error(`Request failed with ${response.status}`);
	}

	return await response.json();
}

export { fetchDetail, fetchStageCorpus };
export type { StageCorpusResponse };
