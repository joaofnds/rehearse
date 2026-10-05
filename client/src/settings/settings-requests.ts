import { launchClient } from "#client/api-client";
import { LaunchRefusedError } from "#client/launch/post-launch";
import type { SettingsReading } from "#client/launch/settings-query";

async function fetchRecordsSize(): Promise<number> {
	const response = await launchClient.api.settings.records.$get();
	if (response.status === 200) {
		const { bytes } = await response.json();

		return bytes;
	}
	const contentType = response.headers.get("content-type") ?? "";
	if (!contentType.startsWith("application/json")) {
		throw new LaunchRefusedError(await response.text());
	}
	const refusal = await response.json();
	throw new LaunchRefusedError(refusal.error);
}

/** Read apart from the settings, because it walks the whole records tree. */
export const recordsSizeQuery = {
	queryKey: ["records-size"],
	queryFn: fetchRecordsSize,
} as const;

/** The request guard refuses a write that is not JSON, body or none. */
const AS_JSON = { headers: { "content-type": "application/json" } };

/**
 * A refusal the routes declare arrives as `{ error }`. Anything else, the
 * request guard's plain-text 403 included, is shown as the server sent it.
 */
export async function linkCorpusDirectory(
	directory: string,
): Promise<SettingsReading> {
	const response = await launchClient.api.settings.corpus.$put({
		json: { directory },
	});
	if (response.status === 200) {
		return response.json();
	}
	if (response.status === 400 || response.status === 409) {
		const refusal = await response.json();
		throw new LaunchRefusedError(refusal.error);
	}
	throw new LaunchRefusedError(await response.text());
}

export async function unlinkCorpusDirectory(): Promise<SettingsReading> {
	const response = await launchClient.api.settings.corpus.$delete({}, AS_JSON);
	if (response.status === 200) {
		return response.json();
	}
	if (response.status === 409) {
		const refusal = await response.json();
		throw new LaunchRefusedError(refusal.error);
	}
	throw new LaunchRefusedError(await response.text());
}

/** Records a version of the linked corpus now, answering its label. */
export async function rehashCorpus(): Promise<string> {
	const response = await launchClient.api.settings.corpus.rehash.$post(
		{},
		AS_JSON,
	);
	if (response.status === 200) {
		const { label } = await response.json();

		return label;
	}
	if (response.status === 409) {
		const refusal = await response.json();
		throw new LaunchRefusedError(refusal.error);
	}
	throw new LaunchRefusedError(await response.text());
}
