import { launchClient } from "#client/api-client";
import { SettingsRefusedError } from "#client/launch/settings-query";
import type { SettingsReading } from "#client/launch/settings-query";
import { refusalReason } from "#client/refusal-reason";

/** Links what setup scanned, where an empty path is the live install. */
export async function linkSetupCorpus(
	directory: string,
): Promise<SettingsReading> {
	const response = await launchClient.api.setup.corpus.$put({
		json: { directory },
	});
	if (response.status !== 200) {
		throw new SettingsRefusedError(await refusalReason(response));
	}

	return response.json();
}
