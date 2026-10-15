import type { TargetService } from "./pipeline";
import type {
	ContainerOwner,
	ContainerRuntime,
	OwnedContainer,
	ServiceReadiness,
	StartedContainer,
} from "./target-services";

const FIRST_HOST_PORT = 49_152;

/** A database a target's setup, checks and sessions reach through DATABASE_URL. */
export const POSTGRES: TargetService = {
	name: "postgres",
	image: "postgres:18-alpine",
	port: 5432,
	ready: ["pg_isready", "-h", "127.0.0.1"],
	exports: { DATABASE_URL: "postgres://127.0.0.1:{port}/app" },
};

export const READY_AT_ONCE: ServiceReadiness = {
	checks: 1,
	wait: () => Promise.resolve(),
};

interface FakeContainer {
	readonly id: string;
	readonly service: string;
	readonly owner: ContainerOwner;
}

/**
 * Containers that start at once on ports counted up from the first dynamic
 * port, and pass their readiness command on the check a test seeds.
 */
export class FakeContainerRuntime implements ContainerRuntime {
	readonly #containers = new Map<string, FakeContainer>();

	readonly #readyOnCheck = new Map<string, number>();

	readonly #readinessCommands = new Map<string, (readonly string[])[]>();

	readonly #unstartable = new Set<string>();

	readonly #unremovable = new Set<string>();

	readonly #stopsBeforeReady = new Set<string>();

	readonly #hangsOnStart = new Set<string>();

	readonly #startCalls = new Set<string>();

	readonly #startWaiters = new Map<string, PromiseWithResolvers<undefined>>();

	#started = 0;

	public start(
		service: TargetService,
		owner: ContainerOwner,
	): Promise<StartedContainer> {
		this.#startCalls.add(service.name);
		this.#startWaiters.get(service.name)?.resolve(undefined);
		if (this.#unstartable.has(service.name)) {
			return Promise.reject(new Error(`${service.name} image is missing`));
		}

		const id = `container-${this.#started}`;
		const hostPort = FIRST_HOST_PORT + this.#started;
		this.#started += 1;
		this.#containers.set(id, { id, service: service.name, owner });
		if (this.#hangsOnStart.has(service.name)) {
			return Promise.withResolvers<StartedContainer>().promise;
		}

		return Promise.resolve({ id, hostPort });
	}

	public succeeds(id: string, command: readonly string[]): Promise<boolean> {
		const name = this.#containers.get(id)?.service ?? id;
		const commands = this.#readinessCommands.get(name) ?? [];
		commands.push(command);
		this.#readinessCommands.set(name, commands);
		if (this.#stopsBeforeReady.has(name)) {
			return Promise.reject(new Error(`${name} exited`));
		}

		return Promise.resolve(
			commands.length >= (this.#readyOnCheck.get(name) ?? 1),
		);
	}

	public owned(owner: ContainerOwner): Promise<readonly OwnedContainer[]> {
		return Promise.resolve(
			[...this.#containers.values()]
				.filter(
					(container) =>
						container.owner.run === owner.run &&
						container.owner.attempt === owner.attempt,
				)
				.map(({ id, service }) => ({ id, service })),
		);
	}

	public remove(id: string): Promise<void> {
		const name = this.#containers.get(id)?.service ?? id;
		if (this.#unremovable.has(name)) {
			return Promise.reject(new Error(`${name} is stuck`));
		}

		this.#containers.delete(id);

		return Promise.resolve();
	}

	/** The services whose containers are still running, in start order. */
	public runningServices(): readonly string[] {
		return [...this.#containers.values()].map(({ service }) => service);
	}

	/** The commands each readiness check of this service ran, in order. */
	public readinessCommands(name: string): readonly (readonly string[])[] {
		return this.#readinessCommands.get(name) ?? [];
	}

	/** Resolves once this service's start has been asked for. */
	public startRequested(name: string): Promise<undefined> {
		if (this.#startCalls.has(name)) {
			return Promise.resolve(undefined);
		}

		const requested = Promise.withResolvers<undefined>();
		this.#startWaiters.set(name, requested);

		return requested.promise;
	}

	/** Passes this service's readiness command from its nth check on. */
	public readyOnCheck(name: string, check: number): void {
		this.#readyOnCheck.set(name, check);
	}

	public failToStart(name: string): void {
		this.#unstartable.add(name);
	}

	public failToRemove(name: string): void {
		this.#unremovable.add(name);
	}

	/** Creates this service's container but never reports its start. */
	public hangOnStart(name: string): void {
		this.#hangsOnStart.add(name);
	}

	/** Its container exits before any readiness check passes. */
	public stopBeforeReady(name: string): void {
		this.#stopsBeforeReady.add(name);
	}

	public reset(): void {
		this.#containers.clear();
		this.#readyOnCheck.clear();
		this.#readinessCommands.clear();
		this.#unstartable.clear();
		this.#unremovable.clear();
		this.#stopsBeforeReady.clear();
		this.#hangsOnStart.clear();
		this.#startCalls.clear();
		this.#startWaiters.clear();
		this.#started = 0;
	}
}
