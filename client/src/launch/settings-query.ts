import type { InferResponseType } from "hono/client";
import { launchClient } from "#client/api-client";
import { refusalReason } from "#client/refusal-reason";

export type SettingsReading = InferResponseType<
	typeof launchClient.api.settings.$get,
	200
>;

/** The server refused to read or store a setting, and its message says why. */
export class SettingsRefusedError extends Error {
	public override name = "SettingsRefusedError";
}

async function fetchSettings(): Promise<SettingsReading> {
	const response = await launchClient.api.settings.$get();
	if (response.status !== 200) {
		throw new SettingsRefusedError(await refusalReason(response));
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
