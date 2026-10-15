import type { TargetCheck, TargetService } from "./pipeline";
import { SERVICE_PORT_PLACEHOLDER } from "./pipeline";

export class TargetServiceError extends Error {
	public override name = "TargetServiceError";

	public constructor(
		public readonly service: string,
		message: string,
		options?: Readonly<ErrorOptions>,
	) {
		super(`Target service ${service} ${message}`, options);
	}
}

export interface StartedContainer {
	readonly id: string;
	readonly hostPort: number;
}

/** Runs a target's services as containers reachable from this machine only. */
export interface ContainerRuntime {
	readonly start: (service: TargetService) => Promise<StartedContainer>;
	/** Whether the command exits zero inside the container. */
	readonly succeeds: (
		id: string,
		command: readonly string[],
	) => Promise<boolean>;
	readonly remove: (id: string) => Promise<void>;
}

/** How many times a service's readiness command runs, and the pause between. */
export interface ServiceReadiness {
	readonly checks: number;
	readonly wait: () => Promise<void>;
}

/** Each service's exports, its assigned port in place of the placeholder. */
export type ServiceEnvironment = Readonly<Record<string, string>>;

/** Up to a minute, since a database image initializes its data on first start. */
export const SERVICE_READINESS: ServiceReadiness = {
	checks: 120,
	wait: () => Bun.sleep(500),
};

export interface RunningServices {
	readonly environment: ServiceEnvironment;
	readonly stop: () => Promise<void>;
}

export async function startServices(
	services: readonly TargetService[],
	runtime: ContainerRuntime,
	readiness: ServiceReadiness,
): Promise<RunningServices> {
	const running = new Map<string, string>();
	const stop = async (): Promise<void> => {
		await removeContainers(running, runtime);
	};

	const environment: Record<string, string> = {};
	try {
		for (const service of services) {
			const container = await startContainer(service, runtime);
			running.set(container.id, service.name);
			await awaitReady(service, container.id, runtime, readiness);
			Object.assign(environment, exportsOn(service, container.hostPort));
		}
	} catch (error) {
		await removeContainers(running, runtime, { cause: error });
		throw error;
	}

	return { environment, stop };
}

/** A check's own value wins over a service's export of the same variable. */
export function checksWithServices(
	checks: readonly TargetCheck[],
	environment: ServiceEnvironment,
): readonly TargetCheck[] {
	return checks.map((check) => ({
		...check,
		env: { ...environment, ...check.env },
	}));
}

async function startContainer(
	service: TargetService,
	runtime: ContainerRuntime,
): Promise<StartedContainer> {
	try {
		return await runtime.start(service);
	} catch (error) {
		throw new TargetServiceError(
			service.name,
			`could not start from ${service.image}`,
			{ cause: error },
		);
	}
}

function exportsOn(
	service: TargetService,
	hostPort: number,
): ServiceEnvironment {
	return Object.fromEntries(
		Object.entries(service.exports).map(([variable, value]) => [
			variable,
			value.replaceAll(SERVICE_PORT_PLACEHOLDER, String(hostPort)),
		]),
	);
}

/**
 * Tries every container before reporting the ones left running, and forgets
 * each one it removed, so stopping again retries only those. The reported
 * cause is the failure that led here, when one did, or else the first removal
 * that failed.
 */
async function removeContainers(
	running: Map<string, string>,
	runtime: ContainerRuntime,
	options: Readonly<ErrorOptions> = {},
): Promise<void> {
	const failures: unknown[] = [];
	for (const id of running.keys()) {
		try {
			await runtime.remove(id);
			running.delete(id);
		} catch (error) {
			failures.push(error);
		}
	}

	const [left] = running.values();
	if (left !== undefined) {
		const ids = [...running.keys()].join(", ");
		throw new TargetServiceError(
			left,
			`could not be removed; remove container ${ids} by hand`,
			{ cause: options.cause ?? failures[0] },
		);
	}
}

async function awaitReady(
	service: TargetService,
	id: string,
	runtime: ContainerRuntime,
	readiness: ServiceReadiness,
): Promise<void> {
	for (let check = 1; check <= readiness.checks; check += 1) {
		if (await runtime.succeeds(id, service.ready)) {
			return;
		}

		await readiness.wait();
	}

	throw new TargetServiceError(
		service.name,
		`did not pass \`${service.ready.join(" ")}\` in ${readiness.checks} checks`,
	);
}
