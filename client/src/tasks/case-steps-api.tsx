import type { InferResponseType } from "hono/client";

import type { StageDefinition } from "#benchmark/pipeline";
import { launchClient } from "#client/api-client";
import HTTP_STATUS from "#client/http-status";
import refusalReason from "#client/refusal-reason";

const stepsRoute = launchClient.api.cases[":id"].steps;

type DeclaredSteps = InferResponseType<
	typeof stepsRoute.$get,
	typeof HTTP_STATUS.ok
>;

class StepsRefusedError extends Error {
	public override name = "StepsRefusedError";
}

interface StepsQuery {
	readonly queryKey: readonly ["case-steps", string];
	readonly queryFn: () => Promise<DeclaredSteps>;
}

function stepsQuery(caseId: string): StepsQuery {
	return {
		queryFn: async () => {
			const response = await stepsRoute.$get({ param: { id: caseId } });
			if (response.status !== HTTP_STATUS.ok) {
				throw new StepsRefusedError(await refusalReason(response));
			}

			return await response.json();
		},
		queryKey: ["case-steps", caseId],
	};
}

interface PutStepsProps {
	readonly caseId: string;
	readonly stages: readonly StageDefinition[];
}

async function putSteps({
	caseId,
	stages,
}: PutStepsProps): Promise<DeclaredSteps> {
	const response = await stepsRoute.$put(
		{ param: { id: caseId } },
		{
			headers: { "Content-Type": "application/json" },
			init: { body: JSON.stringify({ stages }) },
		},
	);
	if (response.status !== HTTP_STATUS.ok) {
		throw new StepsRefusedError(await refusalReason(response));
	}

	return await response.json();
}

export { putSteps, stepsQuery };
export type { DeclaredSteps, PutStepsProps };
