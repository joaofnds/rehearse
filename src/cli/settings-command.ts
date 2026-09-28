import {
	readSettings,
	SET_SPEND_CEILING_COMMAND,
	storeSpendCeiling,
} from "#benchmark/settings";
import { asUsageErrorAsync } from "#cli/commands";
import type { CommandOutput } from "#cli/output";

export interface SettingsRequest {
	readonly runsDirectory: string;
	readonly spendCeilingUsd: string | undefined;
	readonly json: boolean;
}

/**
 * Shows the stored settings, storing a new spend ceiling first when one is
 * given. The records location is shown and never stored: the environment
 * variable that points every command at it owns it.
 */
export async function runSettings(
	request: SettingsRequest,
	output: CommandOutput,
): Promise<void> {
	const { spendCeilingUsd } = request;
	if (spendCeilingUsd !== undefined) {
		await asUsageErrorAsync(() =>
			storeSpendCeiling(request.runsDirectory, Number(spendCeilingUsd)),
		);
	}

	const settings = await readSettings(request.runsDirectory);
	if (request.json) {
		output.stdout(
			`${JSON.stringify({ ...settings, recordsDirectory: request.runsDirectory })}\n`,
		);

		return;
	}

	const ceiling =
		settings.spendCeilingUsd === undefined
			? `not set, so nothing spends. Set it with: ${SET_SPEND_CEILING_COMMAND}`
			: `USD ${String(settings.spendCeilingUsd)}`;
	output.stdout(
		`Spend ceiling: ${ceiling}\nRecords location: ${request.runsDirectory}\n`,
	);
}
