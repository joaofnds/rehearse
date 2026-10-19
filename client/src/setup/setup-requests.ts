import { launchClient } from "#client/api-client";
import HTTP_STATUS from "#client/http-status";
import type { SettingsReading } from "#client/launch/settings-query";
import { SettingsRefusedError } from "#client/launch/settings-query";
import refusalReason from "#client/refusal-reason";

/** Links what setup scanned, where an empty path is the live install. */
async function linkSetupCorpus(directory: string): Promise<SettingsReading> {
	const response = await launchClient.api.setup.corpus.$put({
		json: { directory },
	});
	if (response.status !== HTTP_STATUS.ok) {
		throw new SettingsRefusedError(await refusalReason(response));
	}

	return await response.json();
}

export { linkSetupCorpus as default };
