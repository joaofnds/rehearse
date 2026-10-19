import type { InferResponseType } from "hono/client";

import { apiClient } from "#client/api-client";
import HTTP_STATUS from "#client/http-status";
import RecordNotFoundError from "#client/record-not-found";

const stageEvidence =
	apiClient.api.runs[":run"].stages[":stage"].evidence[":section"][":item"][
		":index"
	];

const finalEvidence =
	apiClient.api.runs[":run"].final.evidence[":item"][":index"];

type EvidenceSourceResponse = InferResponseType<
	typeof stageEvidence.$get,
	typeof HTTP_STATUS.ok
>;

/** The evidence item a page opens: a stage judge's or the final judge's. */
type EvidenceSourceIdentity =
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

/**
 * The Hono RPC client writes each path param into the URL as given (hono
 * 4.13.7, `replaceUrlParam`), so a `/` or `..` in a param would move the
 * request to another path unless it is escaped here.
 */
const escaped = encodeURIComponent;

async function fetchEvidenceSource(
	identity: EvidenceSourceIdentity,
): Promise<EvidenceSourceResponse> {
	const response =
		identity.kind === "stage"
			? await stageEvidence.$get({
					param: {
						index: escaped(identity.index),
						item: escaped(identity.item),
						run: escaped(identity.run),
						section: escaped(identity.section),
						stage: escaped(identity.stage),
					},
				})
			: await finalEvidence.$get({
					param: {
						index: escaped(identity.index),
						item: escaped(identity.item),
						run: escaped(identity.run),
					},
				});
	// A refused run id names no record either, and asking again changes nothing.
	if (
		response.status === HTTP_STATUS.notFound ||
		response.status === HTTP_STATUS.badRequest
	) {
		throw new RecordNotFoundError("The run record holds no such evidence item");
	}
	if (!response.ok) {
		throw new Error(`Evidence source answered ${String(response.status)}`);
	}

	return await response.json();
}

export { fetchEvidenceSource as default };
export type { EvidenceSourceIdentity, EvidenceSourceResponse };
