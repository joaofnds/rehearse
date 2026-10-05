import { launchClient } from "#client/api-client";
import { refusalReason } from "#client/refusal-reason";
import type { LaunchRequest } from "#server/launches";

export class LaunchRefusedError extends Error {
	public override name = "LaunchRefusedError";
}

export async function postLaunch(request: LaunchRequest): Promise<void> {
	const response = await launchClient.api.launches.$post({ json: request });
	if (!response.ok) {
		throw new LaunchRefusedError(await refusalReason(response));
	}
}
