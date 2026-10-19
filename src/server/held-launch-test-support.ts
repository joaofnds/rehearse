/** A launch the fake keeps from finishing until the test releases it. */
class HeldLaunch {
	readonly #reached = Promise.withResolvers<undefined>();
	readonly #released = Promise.withResolvers<undefined>();

	/** Settles once the held launch has been asked for. */
	public get reached(): Promise<undefined> {
		return this.#reached.promise;
	}

	public release(): void {
		this.#released.resolve();
	}

	public async hold(): Promise<void> {
		this.#reached.resolve();
		await this.#released.promise;
	}
}

export { HeldLaunch as default };
