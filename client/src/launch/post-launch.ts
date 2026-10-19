import { launchClient } from "#client/api-client";
import refusalReason from "#client/refusal-reason";
import type { LaunchRequest } from "#server/launches";

class LaunchRefusedError extends Error {
	public override name = "LaunchRefusedError";
}

async function postLaunch(request: LaunchRequest): Promise<void> {
	const response = await launchClient.api.launches.$post({ json: request });
	if (!response.ok) {
		throw new LaunchRefusedError(await refusalReason(response));
	}
}

export { LaunchRefusedError, postLaunch };
