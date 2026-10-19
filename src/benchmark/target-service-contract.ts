import type { TargetService } from "./pipeline";

class TargetServiceError extends Error {
	public override name = "TargetServiceError";

	public constructor(
		public readonly service: string,
		message: string,
		options?: Readonly<ErrorOptions>,
	) {
		super(`Target service ${service} ${message}`, options);
	}
}

interface StartedContainer {
	readonly id: string;
	readonly hostPort: number;
}

/**
 * Whom a container belongs to: the run or confirmation group an operator
 * recovers by, and the run or attempt whose end removes it.
 */
interface ContainerOwner {
	readonly run: string;
	readonly attempt: string;
}

interface OwnedContainer {
	readonly id: string;
	readonly service: string;
}

/** Runs a target's services as containers reachable from this machine only. */
interface ContainerRuntime {
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
interface ServiceReadiness {
	readonly checks: number;
	readonly wait: () => Promise<void>;
}

/** Each service's exports, its assigned port in place of the placeholder. */
type ServiceEnvironment = Readonly<Record<string, string>>;

/** The services one run or attempt starts, and stops whenever it ends. */
interface TargetServices {
	/** Starts each service in turn and waits until it is ready. */
	readonly start: (
		services: readonly TargetService[],
	) => Promise<ServiceEnvironment>;
	/** Removes every container the owner started, however far its start got. */
	readonly stop: () => Promise<void>;
}

export { TargetServiceError as default };
export type {
	StartedContainer,
	ContainerOwner,
	OwnedContainer,
	ContainerRuntime,
	ServiceReadiness,
	ServiceEnvironment,
	TargetServices,
};
