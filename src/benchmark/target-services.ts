import { RefusedPreconditionError } from "./exit-codes";
import type { TargetCheck, TargetDefinition, TargetService } from "./pipeline";
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

/**
 * Whom a container belongs to: the run or confirmation group an operator
 * recovers by, and the run or attempt whose end removes it.
 */
export interface ContainerOwner {
	readonly run: string;
	readonly attempt: string;
}

export interface OwnedContainer {
	readonly id: string;
	readonly service: string;
}

/** Runs a target's services as containers reachable from this machine only. */
export interface ContainerRuntime {
	readonly start: (
		service: TargetService,
		owner: ContainerOwner,
	) => Promise<StartedContainer>;
	/**
	 * Whether the command exits zero inside the container. Rejects when the
	 * container has stopped or the command cannot run in it, since no later
	 * check can pass.
	 */
	readonly succeeds: (
		id: string,
		command: readonly string[],
	) => Promise<boolean>;
	/** Every container started for the owner, including one whose start has not returned. */
	readonly owned: (owner: ContainerOwner) => Promise<readonly OwnedContainer[]>;
	readonly remove: (id: string) => Promise<void>;
}

/** How many times a service's readiness command runs, and the pause between. */
export interface ServiceReadiness {
	readonly checks: number;
	readonly wait: () => Promise<void>;
}

/** Each service's exports, its assigned port in place of the placeholder. */
export type ServiceEnvironment = Readonly<Record<string, string>>;

/** 120 checks half a second apart, since a database image initializes its data on first start. */
export const SERVICE_READINESS: ServiceReadiness = {
	checks: 120,
	wait: () => Bun.sleep(500),
};

/** The services one run or attempt starts, and stops whenever it ends. */
export interface TargetServices {
	/** Starts each service in turn and waits until it is ready. */
	readonly start: (
		services: readonly TargetService[],
	) => Promise<ServiceEnvironment>;
	/** Removes every container the owner started, however far its start got. */
	readonly stop: () => Promise<void>;
}

export function targetServices(
	owner: ContainerOwner,
	runtime: ContainerRuntime,
	readiness: ServiceReadiness,
): TargetServices {
	return {
		start: async (services) => {
			const environment: Record<string, string> = {};
			for (const service of services) {
				try {
					const container = await startContainer(service, owner, runtime);
					await awaitReady(service, container.id, runtime, readiness);
					Object.assign(environment, exportsOn(service, container.hostPort));
				} catch (error) {
					const failure =
						error instanceof Error ? error : new Error(String(error));
					await removeAfterFailedStart(service, owner, runtime, failure);
					throw error;
				}
			}

			return environment;
		},
		stop: () => removeOwned(owner, runtime),
	};
}

/** A service that cannot start or never gets ready is a precondition the run refuses. */
export async function startTargetServices(
	services: TargetServices,
	target: TargetDefinition,
): Promise<ServiceEnvironment> {
	try {
		return await services.start(target.services ?? []);
	} catch (error) {
		if (error instanceof TargetServiceError) {
			throw new RefusedPreconditionError(error.message);
		}

		throw error;
	}
}

/** Tries every attempt's services before reporting the ones left running. */
export async function stopEvery(
	services: readonly TargetServices[],
): Promise<void> {
	const failures: unknown[] = [];
	await Promise.all(
		services.map(async ({ stop }) => {
			try {
				await stop();
			} catch (error) {
				failures.push(error);
			}
		}),
	);

	if (failures.length > 0) {
		throw new AggregateError(failures, failures.map(String).join("\n"));
	}
}

/** The target's setup, when it declares one, with the services' exports. */
export function setupWithServices(
	setup: readonly TargetCheck[] | undefined,
	environment: ServiceEnvironment,
): readonly TargetCheck[] | undefined {
	return setup === undefined
		? undefined
		: checksWithServices(setup, environment);
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
	owner: ContainerOwner,
	runtime: ContainerRuntime,
): Promise<StartedContainer> {
	try {
		return await runtime.start(service, owner);
	} catch (error) {
		throw new TargetServiceError(
			service.name,
			`could not start from ${service.image}: ${error instanceof Error ? error.message : String(error)}`,
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
 * The start's failure stays the one reported. A container left behind joins
 * it, so the operator learns both what failed and what to remove.
 */
async function removeAfterFailedStart(
	service: TargetService,
	owner: ContainerOwner,
	runtime: ContainerRuntime,
	failure: Readonly<Error>,
): Promise<void> {
	try {
		await removeOwned(owner, runtime);
	} catch (error) {
		const removal = error instanceof Error ? error.message : String(error);
		throw new TargetServiceError(
			service.name,
			`failed to start and left a container behind. ${failure.message}. ${removal}`,
			{
				cause: new AggregateError(
					[failure, error],
					"a service failed to start and its containers could not be removed",
				),
			},
		);
	}
}

/** Tries every container before reporting the ones left running. */
async function removeOwned(
	owner: ContainerOwner,
	runtime: ContainerRuntime,
): Promise<void> {
	const left: OwnedContainer[] = [];
	const failures: unknown[] = [];
	for (const container of await runtime.owned(owner)) {
		try {
			await runtime.remove(container.id);
		} catch (error) {
			left.push(container);
			failures.push(error);
		}
	}

	const [first] = left;
	const [cause] = failures;
	if (first !== undefined) {
		const ids = left.map(({ id }) => id).join(" ");
		const reason = cause instanceof Error ? cause.message : String(cause);
		throw new TargetServiceError(
			first.service,
			`could not be removed (${reason}); remove it by hand with docker rm --force ${ids}`,
			{ cause },
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
		if (await readyCheck(service, id, runtime)) {
			return;
		}

		await readiness.wait();
	}

	throw new TargetServiceError(
		service.name,
		`did not pass \`${service.ready.join(" ")}\` in ${readiness.checks} checks`,
	);
}

async function readyCheck(
	service: TargetService,
	id: string,
	runtime: ContainerRuntime,
): Promise<boolean> {
	try {
		return await runtime.succeeds(id, service.ready);
	} catch (error) {
		throw new TargetServiceError(
			service.name,
			`stopped before it was ready: ${error instanceof Error ? error.message : String(error)}`,
			{ cause: error },
		);
	}
}
