import { launchClient } from "#client/api-client";
import { LaunchRefusedError } from "#client/launch/post-launch";

async function fetchRecordsSize(): Promise<number> {
	const response = await launchClient.api.settings.records.$get();
	if (response.status === 409) {
		const refusal = await response.json();
		throw new LaunchRefusedError(refusal.error);
	}
	const { bytes } = await response.json();

	return bytes;
}

/** Read apart from the settings, because it walks the whole records tree. */
export const recordsSizeQuery = {
	queryKey: ["records-size"],
	queryFn: fetchRecordsSize,
} as const;
