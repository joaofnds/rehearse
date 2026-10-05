import { launchClient } from "#client/api-client";
import { LaunchRefusedError } from "#client/launch/post-launch";
import type { SettingsReading } from "#client/launch/settings-query";

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

export async function linkCorpusDirectory(
	directory: string,
): Promise<SettingsReading> {
	const response = await launchClient.api.settings.corpus.$put({
		json: { directory },
	});
	if (response.status === 200) {
		return response.json();
	}
	const refusal = await response.json();
	throw new LaunchRefusedError(refusal.error);
}

export async function unlinkCorpusDirectory(): Promise<SettingsReading> {
	const response = await launchClient.api.settings.corpus.$delete();
	if (response.status === 200) {
		return response.json();
	}
	const refusal = await response.json();
	throw new LaunchRefusedError(refusal.error);
}

/** Records a version of the linked corpus now, answering its label. */
export async function rehashCorpus(): Promise<string> {
	const response = await launchClient.api.settings.corpus.rehash.$post();
	if (response.status === 200) {
		const { label } = await response.json();

		return label;
	}
	const refusal = await response.json();
	throw new LaunchRefusedError(refusal.error);
}
