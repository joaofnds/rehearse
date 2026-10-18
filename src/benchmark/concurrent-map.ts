/** Read independent items with at most 16 pending reads, preserving input order. */
export async function concurrentMap<Input, Output>(
	inputs: readonly Input[],
	read: (input: Input) => Promise<Output>,
): Promise<Output[]> {
	const results: Output[] = [];
	const pending = inputs.entries();
	const worker = async (): Promise<void> => {
		for (const [index, input] of pending) {
			results[index] = await read(input);
		}
	};
	const settled = await Promise.allSettled(
		Array.from({ length: Math.min(16, inputs.length) }, worker),
	);
	for (const result of settled) {
		if (result.status === "rejected") {
			throw result.reason;
		}
	}

	return results;
}
