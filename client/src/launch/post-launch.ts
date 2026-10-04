import { launchClient } from "#client/api-client";
import type { LaunchRequest } from "#server/launches";

export class LaunchRefusedError extends Error {
	public override name = "LaunchRefusedError";
}

/**
 * A refusal the launch routes declare arrives as `{ error }`. Anything else,
 * the request guard's plain-text 403 included, is shown as the server sent it.
 */
export async function postLaunch(request: LaunchRequest): Promise<void> {
	const response = await launchClient.api.launches.$post({ json: request });
	if (response.ok) {
		return;
	}
	if (
		response.status === 400 ||
		response.status === 404 ||
		response.status === 409
	) {
		const refusal = await response.json();
		throw new LaunchRefusedError(refusal.error);
	}
	throw new LaunchRefusedError(await response.text());
}
