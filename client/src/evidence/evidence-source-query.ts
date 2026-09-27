import type { InferResponseType } from "hono/client";
import { apiClient } from "#client/api-client";

const stageEvidence =
	apiClient.api.runs[":run"].stages[":stage"].evidence[":section"][":item"][
		":index"
	];
const finalEvidence =
	apiClient.api.runs[":run"].final.evidence[":item"][":index"];

export type EvidenceSourceResponse = InferResponseType<
	typeof stageEvidence.$get,
	200
>;

/** The evidence item a page opens: a stage judge's or the final judge's. */
export type EvidenceSourceIdentity =
	| {
			readonly kind: "stage";
			readonly run: string;
			readonly stage: string;
			readonly section: string;
			readonly item: string;
			readonly index: string;
	  }
	| {
			readonly kind: "final";
			readonly run: string;
			readonly item: string;
			readonly index: string;
	  };

export async function fetchEvidenceSource(
	identity: EvidenceSourceIdentity,
): Promise<EvidenceSourceResponse> {
	const response =
		identity.kind === "stage"
			? await stageEvidence.$get({ param: identity })
			: await finalEvidence.$get({ param: identity });
	if (!response.ok) {
		throw new Error(`Evidence source answered ${String(response.status)}`);
	}

	return response.json();
}
