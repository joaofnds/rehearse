import { launchClient } from "#client/api-client";
import HTTP_STATUS from "#client/http-status";
import type { SettingsReading } from "#client/launch/settings-query";
import { SettingsRefusedError } from "#client/launch/settings-query";
import refusalReason from "#client/refusal-reason";

async function fetchRecordsSize(): Promise<number> {
	const response = await launchClient.api.settings.records.$get();
	if (response.status !== HTTP_STATUS.ok) {
		throw new SettingsRefusedError(await refusalReason(response));
	}

	const { bytes } = await response.json();

	return bytes;
}

/** Read apart from the settings, because it walks the whole records tree. */
const recordsSizeQuery = {
	queryFn: fetchRecordsSize,
	queryKey: ["records-size"],
} as const;

async function linkCorpusDirectory(
	directory: string,
): Promise<SettingsReading> {
	const response = await launchClient.api.settings.corpus.$put({
		json: { directory },
	});
	if (response.status !== HTTP_STATUS.ok) {
		throw new SettingsRefusedError(await refusalReason(response));
	}

	return await response.json();
}

async function unlinkCorpusDirectory(): Promise<SettingsReading> {
	const response = await launchClient.api.settings.corpus.$delete();
	if (response.status !== HTTP_STATUS.ok) {
		throw new SettingsRefusedError(await refusalReason(response));
	}

	return await response.json();
}

/** Records a version of the linked corpus now, answering its label. */
async function rehashCorpus(): Promise<string> {
	const response = await launchClient.api.settings.corpus.rehash.$post();
	if (response.status !== HTTP_STATUS.ok) {
		throw new SettingsRefusedError(await refusalReason(response));
	}

	const { label } = await response.json();

	return label;
}

export {
	linkCorpusDirectory,
	recordsSizeQuery,
	rehashCorpus,
	unlinkCorpusDirectory,
};
