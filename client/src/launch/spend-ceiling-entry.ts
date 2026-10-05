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

const PLAIN_DECIMAL = new Intl.NumberFormat("en-US", {
	useGrouping: false,
	maximumFractionDigits: 20,
});

/**
 * A stored ceiling as the field shows it: to the cent, as an amount is
 * written, and never rounded, since a ceiling stored from the CLI can be
 * finer than a cent and the field would then misstate it. It is written
 * out in plain decimals, because the entry rule refuses 1e-7.
 */
export function storedCeilingEntry(usd: number): string {
	const cents = usd.toFixed(2);

	return Number(cents) === usd ? cents : PLAIN_DECIMAL.format(usd);
}
