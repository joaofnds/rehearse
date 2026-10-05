import { launchClient } from "#client/api-client";
import { SettingsRefusedError } from "#client/launch/settings-query";
import type { SettingsReading } from "#client/launch/settings-query";
import { refusalReason } from "#client/refusal-reason";

async function fetchRecordsSize(): Promise<number> {
	const response = await launchClient.api.settings.records.$get();
	if (response.status !== 200) {
		throw new SettingsRefusedError(await refusalReason(response));
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
	if (response.status !== 200) {
		throw new SettingsRefusedError(await refusalReason(response));
	}

	return response.json();
}

export async function unlinkCorpusDirectory(): Promise<SettingsReading> {
	const response = await launchClient.api.settings.corpus.$delete();
	if (response.status !== 200) {
		throw new SettingsRefusedError(await refusalReason(response));
	}

	return response.json();
}

/** Records a version of the linked corpus now, answering its label. */
export async function rehashCorpus(): Promise<string> {
	const response = await launchClient.api.settings.corpus.rehash.$post();
	if (response.status !== 200) {
		throw new SettingsRefusedError(await refusalReason(response));
	}

	const { label } = await response.json();

	return label;
}
