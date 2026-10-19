const FIRST_INPUT_VALUE = 1;
const SECOND_INPUT_VALUE = 2;
interface SerialSourceOptions {
	readonly failure?: Readonly<Error>;
	readonly gate?: Readonly<Promise<number>>;
}
class ControlledSerialSource {
	readonly #options: SerialSourceOptions;
	public readonly started: number[] = [];
	public closed = false;
	public constructor(options: SerialSourceOptions = {}) {
		this.#options = options;
	}
	public *inputs(): Generator<number> {
		try {
			yield FIRST_INPUT_VALUE;
			yield SECOND_INPUT_VALUE;
		} finally {
			this.closed = true;
		}
	}
	public readonly read = async (input: number): Promise<number> => {
		this.started.push(input);
		if (this.#options.failure !== undefined) {
			return await Promise.reject(this.#options.failure);
		}

		return await (input === FIRST_INPUT_VALUE &&
		this.#options.gate !== undefined
			? this.#options.gate
			: Promise.resolve(input));
	};
}
export { ControlledSerialSource as default };
