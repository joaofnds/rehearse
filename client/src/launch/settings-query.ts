import type { InferResponseType } from "hono/client";
import { launchClient } from "#client/api-client";
import { LaunchRefusedError } from "./post-launch";

export type SettingsReading = InferResponseType<
	typeof launchClient.api.settings.$get,
	200
>;

async function fetchSettings(): Promise<SettingsReading> {
	const response = await launchClient.api.settings.$get();
	if (response.status === 409) {
		const refusal = await response.json();
		throw new LaunchRefusedError(refusal.error);
	}
	if (!response.ok) {
		throw new LaunchRefusedError(await response.text());
	}

	return response.json();
}

/**
 * The stored settings, shared by the launch dialog and the corpus screen,
 * which reads from them which corpus is linked.
 */
export const launchSettingsQuery = {
	queryKey: ["launch-settings"],
	queryFn: fetchSettings,
} as const;
