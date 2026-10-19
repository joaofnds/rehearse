import serialMap from "./serial-map";

const MAX_PENDING_READS = 16;

/** Read independent items with at most 16 pending reads, preserving input order. */
async function concurrentMap<Input, Output>(
	inputs: readonly Input[],
	read: (input: Input) => Promise<Output>,
): Promise<Output[]> {
	const results: Output[] = [];
	const pending = inputs.entries();
	const worker = async (): Promise<void> => {
		for await (const inspection of serialMap(
			pending,
			async ([index, input]) => ({
				index,
				output: await read(input),
			}),
		)) {
			const { index, output } = inspection;
			results[index] = output;
		}
	};
	const settled = await Promise.allSettled(
		Array.from({ length: Math.min(MAX_PENDING_READS, inputs.length) }, worker),
	);
	for (const result of settled) {
		if (result.status === "rejected") {
			throw result.reason;
		}
	}

	return results;
}

export { concurrentMap as default };
