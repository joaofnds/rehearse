import type { InferResponseType } from "hono/client";

import { launchClient } from "#client/api-client";
import HTTP_STATUS from "#client/http-status";
import refusalReason from "#client/refusal-reason";

type SettingsReading = InferResponseType<
	typeof launchClient.api.settings.$get,
	typeof HTTP_STATUS.ok
>;

/** The server refused to read or store a setting, and its message says why. */
class SettingsRefusedError extends Error {
	public override name = "SettingsRefusedError";
}

async function fetchSettings(): Promise<SettingsReading> {
	const response = await launchClient.api.settings.$get();
	if (response.status !== HTTP_STATUS.ok) {
		throw new SettingsRefusedError(await refusalReason(response));
	}

	return await response.json();
}

/**
 * The stored settings, shared by the launch dialog and the corpus screen,
 * which reads from them which corpus is linked.
 */
const launchSettingsQuery = {
	queryFn: fetchSettings,
	queryKey: ["launch-settings"],
} as const;

export { launchSettingsQuery, SettingsRefusedError };
export type { SettingsReading };
