/** Read the next item only after its predecessor is consumed; closing stops work. */
async function* serialMap<Input, Output>(
	inputs: Readonly<Iterable<Input>>,
	read: (input: Input) => Promise<Output>,
): AsyncGenerator<Output> {
	for (const input of inputs) {
		yield read(input);
	}
}

export { serialMap as default };
