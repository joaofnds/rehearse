import { beforeEach, describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import type { TargetService } from "./pipeline";
import {
	TargetServiceError,
	checksWithServices,
	targetServices,
} from "./target-services";
import type { ContainerOwner, ServiceReadiness } from "./target-services";
import { FakeContainerRuntime } from "./target-services-test-support";

const postgres: TargetService = {
	exports: { DATABASE_URL: "postgres://127.0.0.1:{port}/app" },
	image: "postgres:18-alpine",
	name: "postgres",
	port: 5432,
	ready: ["pg_isready", "-h", "127.0.0.1"],
};
const redis: TargetService = {
	exports: { REDIS_URL: "redis://127.0.0.1:{port}" },
	image: "redis:8-alpine",
	name: "redis",
	port: 6379,
	ready: ["redis-cli", "ping"],
};
const immediately: ServiceReadiness = {
	checks: 3,
	wait: async () => {
		await Promise.resolve();
	},
};
const run: ContainerOwner = { attempt: "run-1", run: "run-1" };
const otherAttempt: ContainerOwner = {
	attempt: "group-1-rep-1",
	run: "group-1",
};
const runtime = new FakeContainerRuntime();
const environment = { DATABASE_URL: "postgres://127.0.0.1:49152/app" };
const targetServicesStopRemovesEveryContainerItStarted =
	async (): Promise<void> => {
		const services = targetServices(run, runtime, immediately);
		await services.start([postgres, redis]);

		await services.stop();

		expect(runtime.runningServices()).toEqual([]);
	};
const targetServicesStopRemovesAContainerWhoseStartHasNotReturned =
	async (): Promise<void> => {
		runtime.hangOnStart("redis");

		const services = targetServices(run, runtime, immediately);
		void services.start([postgres, redis]);
		await runtime.startRequested("redis");

		await services.stop();

		expect(runtime.runningServices()).toEqual([]);
	};
const targetServicesStopLeavesAnotherAttemptsContainersRunning =
	async (): Promise<void> => {
		await targetServices(otherAttempt, runtime, immediately).start([redis]);
		const services = targetServices(run, runtime, immediately);
		await services.start([postgres]);

		await services.stop();

		expect(runtime.runningServices()).toEqual(["redis"]);
	};
const targetServicesStopWhenAContainerCannotBeRemovedStillRemovesTheOthers =
	async (): Promise<void> => {
		runtime.failToRemove("postgres");

		const services = targetServices(run, runtime, immediately);
		await services.start([postgres, redis]);

		await failureOf(services.stop());

		expect(runtime.runningServices()).toEqual(["postgres"]);
	};
const targetServicesStopWhenAContainerCannotBeRemovedReportsTheServiceItLeftRunning =
	async (): Promise<void> => {
		runtime.failToRemove("postgres");

		const services = targetServices(run, runtime, immediately);
		await services.start([postgres, redis]);

		const failure = await failureOf(services.stop());

		expect(failure).toBeInstanceOf(TargetServiceError);
		expect(failure).toMatchObject({ service: "postgres" });
	};
const checksWithServicesGivesEachCheckTheServicesEnvironment = (): void => {
	const checks = [
		{ command: ["bun", "test"], env: { CONFIG_PATH: "test.yaml" } },
	];

	expect(checksWithServices(checks, environment)).toEqual([
		{
			command: ["bun", "test"],
			env: {
				CONFIG_PATH: "test.yaml",
				DATABASE_URL: "postgres://127.0.0.1:49152/app",
			},
		},
	]);
};
const checksWithServicesKeepsAChecksOwnValueForAVariableAServiceExports =
	(): void => {
		const checks = [
			{
				command: ["bun", "test"],
				env: { DATABASE_URL: "postgres://elsewhere/app" },
			},
		];

		expect(checksWithServices(checks, environment)).toEqual(checks);
	};
describe(targetServices.name, () => {
	beforeEach(() => {
		runtime.reset();
	});
	describe("stop", () => {
		it(
			"removes every container it started",
			targetServicesStopRemovesEveryContainerItStarted,
		);

		it(
			"removes a container whose start has not returned",
			targetServicesStopRemovesAContainerWhoseStartHasNotReturned,
		);

		it(
			"leaves another attempt's containers running",
			targetServicesStopLeavesAnotherAttemptsContainersRunning,
		);

		describe("when a container cannot be removed", () => {
			it(
				"still removes the others",
				targetServicesStopWhenAContainerCannotBeRemovedStillRemovesTheOthers,
			);

			it(
				"reports the service it left running",
				targetServicesStopWhenAContainerCannotBeRemovedReportsTheServiceItLeftRunning,
			);
		});
	});
});
describe(checksWithServices.name, () => {
	it(
		"gives each check the services' environment",
		checksWithServicesGivesEachCheckTheServicesEnvironment,
	);

	it(
		"keeps a check's own value for a variable a service exports",
		checksWithServicesKeepsAChecksOwnValueForAVariableAServiceExports,
	);
});
