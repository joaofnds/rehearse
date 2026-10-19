import CorpusEditBusyError from "./corpus-edit-busy-error";

const NO_STARTING_LAUNCHES = 0;

/**
 * Keeps an instruction edit and a launch start in this server from
 * overlapping, so no launch measures a corpus half written and no edit lands
 * between a launch's start and its record. Each side is refused while the
 * other runs rather than queued, so launches still start alongside each other.
 */
class CorpusEditGate {
	#applying = false;

	#starting = NO_STARTING_LAUNCHES;

	public async starting<T>(start: () => Promise<T>): Promise<T> {
		if (this.#applying) {
			throw new CorpusEditBusyError(
				"An instruction edit is being applied to the linked corpus; start the launch again in a moment",
			);
		}

		this.#starting += 1;
		try {
			return await start();
		} finally {
			this.#starting -= 1;
		}
	}

	public async applying<T>(apply: () => Promise<T>): Promise<T> {
		if (this.#applying) {
			throw new CorpusEditBusyError(
				"Another instruction edit is being applied; review the edit again once it lands",
			);
		}

		if (this.#starting > NO_STARTING_LAUNCHES) {
			throw new CorpusEditBusyError(
				"A launch is starting; apply the edit again once it has started",
			);
		}

		this.#applying = true;
		try {
			return await apply();
		} finally {
			this.#applying = false;
		}
	}
}

export { CorpusEditGate as default };
