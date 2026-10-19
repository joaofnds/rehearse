class RunAbortTransitions {
	private ready: Promise<void> = Promise.resolve();
	private aborted = false;

	public get abortRequested(): boolean {
		return this.aborted;
	}

	public requestAbort(): void {
		this.aborted = true;
	}

	public async enqueue(transition: () => Promise<void>): Promise<void> {
		const previous = this.ready;
		const current = Promise.withResolvers<undefined>();

		this.ready = current.promise;
		await previous;
		try {
			await transition();
		} finally {
			current.resolve();
		}
	}

	public async enqueueNormal(transition: () => Promise<void>): Promise<void> {
		if (this.abortRequested) {
			return;
		}

		await this.enqueue(async () => {
			if (!this.abortRequested) {
				await transition();
			}
		});
	}
}

export { RunAbortTransitions as default };
