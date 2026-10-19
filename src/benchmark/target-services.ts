import { RefusedPreconditionError } from "./exit-codes";
import type { TargetCheck, TargetDefinition, TargetService } from "./pipeline";
import { SERVICE_PORT_PLACEHOLDER } from "./pipeline";
import serialMap from "./serial-map";
import TargetServiceError from "./target-service-contract";
import type {
	ContainerOwner,
	ContainerRuntime,
	OwnedContainer,
	ServiceEnvironment,
	ServiceReadiness,
	StartedContainer,
	TargetServices,
} from "./target-service-contract";

const EMPTY_COLLECTION_LENGTH = 0;

const SERVICE_READY_POLL_INTERVAL_MS = 500;

/** 120 checks half a second apart, since a database image initializes its data on first start. */
const SERVICE_READINESS: ServiceReadiness = {
	checks: 120,
	wait: async () => {
		await Bun.sleep(SERVICE_READY_POLL_INTERVAL_MS);
	},
};

function targetServices(
	owner: ContainerOwner,
	runtime: ContainerRuntime,
	readiness: ServiceReadiness,
): TargetServices {
	return {
		start: async (services) => {
			const environment: Record<string, string> = {};
			await Array.fromAsync(services, async (service) => {
				try {
					const container = await startContainer(service, owner, runtime);
					await awaitReady(service, container.id, { readiness, runtime });
					Object.assign(environment, exportsOn(service, container.hostPort));
				} catch (error) {
					const failure =
						error instanceof Error ? error : new Error(String(error));
					await removeAfterFailedStart({ owner, service }, runtime, failure);

					throw error;
				}
			});

			return environment;
		},
		stop: async () => {
			await removeOwned(owner, runtime);
		},
	};
}

/** A service that cannot start or never gets ready is a precondition the run refuses. */
async function startTargetServices(
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
async function stopEvery(services: readonly TargetServices[]): Promise<void> {
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

	if (failures.length > EMPTY_COLLECTION_LENGTH) {
		throw new AggregateError(failures, failures.map(String).join("\n"));
	}
}

/** The target's setup, when it declares one, with the services' exports. */
function setupWithServices(
	setup: readonly TargetCheck[] | undefined,
	environment: ServiceEnvironment,
): readonly TargetCheck[] | undefined {
	return setup === undefined
		? undefined
		: checksWithServices(setup, environment);
}

/** A check's own value wins over a service's export of the same variable. */
function checksWithServices(
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

interface FailedServiceStart {
	readonly service: TargetService;
	readonly owner: ContainerOwner;
}

/**
 * The start's failure stays the one reported. A container left behind joins
 * it, so the operator learns both what failed and what to remove.
 */
async function removeAfterFailedStart(
	{ service, owner }: FailedServiceStart,
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
	await Array.fromAsync(await runtime.owned(owner), async (container) => {
		try {
			await runtime.remove(container.id);
		} catch (error) {
			left.push(container);
			failures.push(error);
		}
	});

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

interface ServiceReadinessContext {
	readonly runtime: ContainerRuntime;
	readonly readiness: ServiceReadiness;
}

async function awaitReady(
	service: TargetService,
	id: string,
	{ runtime, readiness }: ServiceReadinessContext,
): Promise<void> {
	for await (const ready of serialMap(
		Array.from({ length: readiness.checks }).values(),
		async () => await readyCheck(service, id, runtime),
	)) {
		if (ready) {
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

export {
	SERVICE_READINESS,
	targetServices,
	startTargetServices,
	stopEvery,
	setupWithServices,
	checksWithServices,
};
export { default as TargetServiceError } from "./target-service-contract";
export type {
	StartedContainer,
	ContainerOwner,
	OwnedContainer,
	ContainerRuntime,
	ServiceReadiness,
	ServiceEnvironment,
	TargetServices,
} from "./target-service-contract";
