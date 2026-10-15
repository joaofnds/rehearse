import type { TargetService } from "./pipeline";
import type { ContainerRuntime, StartedContainer } from "./target-services";

const FIRST_HOST_PORT = 49_152;

/**
 * Containers that start at once on ports counted up from the first dynamic
 * port, and pass their readiness command on the check a test seeds.
 */
export class FakeContainerRuntime implements ContainerRuntime {
	readonly #running = new Map<string, string>();

	readonly #readyOnCheck = new Map<string, number>();

	readonly #checks = new Map<string, number>();

	readonly #unstartable = new Set<string>();

	readonly #unremovable = new Set<string>();

	#started = 0;

	public start(service: TargetService): Promise<StartedContainer> {
		if (this.#unstartable.has(service.name)) {
			return Promise.reject(new Error(`${service.name} image is missing`));
		}

		const id = `container-${this.#started}`;
		const hostPort = FIRST_HOST_PORT + this.#started;
		this.#started += 1;
		this.#running.set(id, service.name);

		return Promise.resolve({ id, hostPort });
	}

	public succeeds(id: string): Promise<boolean> {
		const name = this.#running.get(id) ?? id;
		const checks = (this.#checks.get(name) ?? 0) + 1;
		this.#checks.set(name, checks);

		return Promise.resolve(checks >= (this.#readyOnCheck.get(name) ?? 1));
	}

	public remove(id: string): Promise<void> {
		const name = this.#running.get(id) ?? id;
		if (this.#unremovable.has(name)) {
			return Promise.reject(new Error(`${name} is stuck`));
		}

		this.#running.delete(id);

		return Promise.resolve();
	}

	/** The services whose containers are still running, in start order. */
	public runningServices(): readonly string[] {
		return [...this.#running.values()];
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

	public reset(): void {
		this.#running.clear();
		this.#readyOnCheck.clear();
		this.#checks.clear();
		this.#unstartable.clear();
		this.#unremovable.clear();
		this.#started = 0;
	}
}
