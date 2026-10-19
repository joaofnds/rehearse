import type { Immutable } from "#benchmark/contracts";
import { launchClient } from "#client/api-client";
import HTTP_STATUS from "#client/http-status";
import refusalReason from "#client/refusal-reason";
import type { DeclareCaseRequest } from "#server/case-declaration";
import type { PipelineCaseRequest } from "#server/task-bundle-contract";

class DeclarationRefusedError extends Error {
	public override name = "DeclarationRefusedError";
}

/**
 * A refusal the route declares arrives as `{ error }`. Anything else, the
 * request guard's plain-text 403 included, is shown as the server sent it.
 */
async function postDeclaration(
	request: Immutable<DeclareCaseRequest>,
): Promise<string> {
	const response = await launchClient.api.cases.$post({ json: request });
	if (response.status === HTTP_STATUS.created) {
		const declared = await response.json();
		return declared.path;
	}
	if (
		response.status === HTTP_STATUS.badRequest ||
		response.status === HTTP_STATUS.notFound ||
		response.status === HTTP_STATUS.conflict
	) {
		const refusal = await response.json();
		throw new DeclarationRefusedError(refusal.error);
	}
	throw new DeclarationRefusedError(await response.text());
}

async function postPipelineDeclaration(
	request: PipelineCaseRequest,
): Promise<string> {
	const response = await launchClient.api.cases.pipeline.$post(undefined, {
		headers: { "Content-Type": "application/json" },
		init: { body: JSON.stringify(request) },
	});
	if (response.status === HTTP_STATUS.created) {
		const declared = await response.json();
		return declared.path;
	}
	throw new DeclarationRefusedError(await refusalReason(response));
}

export { postDeclaration, postPipelineDeclaration };
