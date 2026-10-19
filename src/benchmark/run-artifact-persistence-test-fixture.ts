import type { RunArtifactPersistence } from "./run-abort";

const NO_ACTIVE_WRITES = 0;

interface ArtifactWrite {
	readonly path: string;
	readonly contents: string;
}
interface PendingArtifactWrite extends ArtifactWrite {
	readonly failure: Error | undefined;
	readonly blocked:
		| {
				readonly started: ReturnType<typeof Promise.withResolvers<undefined>>;
				readonly released: ReturnType<typeof Promise.withResolvers<undefined>>;
		  }
		| undefined;
}

class ControlledRunArtifactPersistence implements RunArtifactPersistence {
	public readonly files = new Map<string, string>();
	public readonly writes: string[] = [];
	public activeWrites = NO_ACTIVE_WRITES;
	public maxActiveWrites = NO_ACTIVE_WRITES;
	private nextFailure: Error | undefined;
	private nextWrite:
		| {
				readonly started: ReturnType<typeof Promise.withResolvers<undefined>>;
				readonly released: ReturnType<typeof Promise.withResolvers<undefined>>;
		  }
		| undefined;

	public blockNextWrite(): BlockedRunArtifactWrite {
		const started = Promise.withResolvers<undefined>();
		const released = Promise.withResolvers<undefined>();
		this.nextWrite = { released, started };

		return {
			release: () => {
				released.resolve();
			},
			started: started.promise,
		};
	}

	public failNextWrite(): Error {
		const failure = new Error("persistence failed");
		this.nextFailure = failure;

		return failure;
	}

	public async write(path: string, contents: string): Promise<void> {
		const write = this.claimWrite({ contents, path });
		this.writeStarted();

		try {
			if (write.blocked !== undefined) {
				write.blocked.started.resolve();
				await write.blocked.released.promise;
			}

			if (write.failure !== undefined) {
				throw write.failure;
			}

			this.files.set(write.path, write.contents);
		} finally {
			this.activeWrites -= 1;
		}
	}
	private claimWrite(request: ArtifactWrite): PendingArtifactWrite {
		this.writes.push(request.contents);
		const blocked = this.nextWrite;
		this.nextWrite = undefined;
		const failure = this.nextFailure;
		this.nextFailure = undefined;

		return { blocked, contents: request.contents, failure, path: request.path };
	}
	private writeStarted(): void {
		this.activeWrites += 1;
		this.maxActiveWrites = Math.max(this.maxActiveWrites, this.activeWrites);
	}

	public reset(): void {
		this.files.clear();
		this.writes.length = 0;
		this.activeWrites = 0;
		this.maxActiveWrites = 0;
		this.nextFailure = undefined;
		this.nextWrite = undefined;
	}
}

interface BlockedRunArtifactWrite {
	readonly started: Promise<undefined>;
	readonly release: () => void;
}
export { ControlledRunArtifactPersistence as default };
