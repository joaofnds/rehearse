/** A launch the fake keeps from finishing until the test releases it. */
export class HeldLaunch {
	readonly #reached = Promise.withResolvers<undefined>();
	readonly #released = Promise.withResolvers<undefined>();

	/** Settles once the held launch has been asked for. */
	public get reached(): Promise<undefined> {
		return this.#reached.promise;
	}

	public release(): void {
		this.#released.resolve(undefined);
	}

	public async hold(): Promise<void> {
		this.#reached.resolve(undefined);
		await this.#released.promise;
	}
}
