import { launchClient } from "#client/api-client";
import { LaunchRefusedError } from "./post-launch";
import type { SettingsReading } from "./settings-query";

export async function putSpendCeiling(usd: number): Promise<SettingsReading> {
	const response = await launchClient.api.settings["spend-ceiling"].$put({
		json: { usd },
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

/**
 * A ceiling the CLI would store too: a plain positive decimal, so "0x10" or
 * "1e3" is refused rather than read as 16 or 1000.
 */
export function enteredCeilingUsd(entered: string): number | undefined {
	if (!/^\d+(?:\.\d+)?$/u.test(entered)) {
		return undefined;
	}
	const usd = Number(entered);

	return usd > 0 ? usd : undefined;
}
