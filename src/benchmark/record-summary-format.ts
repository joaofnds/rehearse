const UNCHANGED_DELTA = 0;

const CURRENCY_DECIMAL_PLACES = 2;

const RESOURCE_DECIMAL_PLACES = 3;

const COST_DELTA_DECIMAL_PLACES = 6;

function table(
	header: readonly string[],
	rows: readonly (readonly string[])[],
): string[] {
	return [
		`| ${header.join(" | ")} |`,
		`| ${header.map(() => "---").join(" | ")} |`,
		...rows.map((row) => `| ${row.join(" | ")} |`),
	];
}

function usd(amount: number): string {
	return `$${amount.toFixed(CURRENCY_DECIMAL_PLACES)}`;
}

function ratio(value: number): string {
	return value.toFixed(RESOURCE_DECIMAL_PLACES);
}

function delta(value: number): string {
	return `${value >= UNCHANGED_DELTA ? "+" : ""}${value.toFixed(RESOURCE_DECIMAL_PLACES)}`;
}

function usdDelta(value: number): string {
	return `${value >= UNCHANGED_DELTA ? "+" : ""}${value.toFixed(COST_DELTA_DECIMAL_PLACES)}`;
}

function usdRatio(value: number): string {
	return value.toFixed(COST_DELTA_DECIMAL_PLACES);
}

export { table, usd, ratio, delta, usdDelta, usdRatio };
