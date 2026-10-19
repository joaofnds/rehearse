import { beforeEach, describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import type { TargetService } from "./pipeline";
import { TargetServiceError, targetServices } from "./target-services";
import type { ContainerOwner, ServiceReadiness } from "./target-services";
import { FakeContainerRuntime } from "./target-services-test-support";

const READINESS_CHECK_BEYOND_LIMIT = 1;
const POSTGRES_READY_AFTER_THIRD_CHECK = 3;
const POSTGRES_READY_AFTER_SECOND_CHECK = 2;
const POLL_PAUSE_COUNT_INCREMENT = 1;
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

const runtime = new FakeContainerRuntime();

const targetServicesStartExportsEachServicesAddressOnThePortItWasGiven =
	async (): Promise<void> => {
		const services = targetServices(run, runtime, immediately);

		const environment = await services.start([postgres, redis]);

		expect(environment).toEqual({
			DATABASE_URL: "postgres://127.0.0.1:49152/app",
			REDIS_URL: "redis://127.0.0.1:49153",
		});
	};
const targetServicesStartWaitsForAServiceThatPassesItsReadinessCommandOnTheLastCheck =
	async (): Promise<void> => {
		runtime.readyOnCheck("postgres", immediately.checks);

		const services = targetServices(run, runtime, immediately);

		const environment = await services.start([postgres]);

		expect(Object.keys(environment)).toEqual(["DATABASE_URL"]);
	};
const targetServicesStartPausesAfterEachReadinessCheckThatFails =
	async (): Promise<void> => {
		const expectedPauses = 2;

		let pauses = 0;
		const counted: ServiceReadiness = {
			checks: 3,
			wait: async () => {
				pauses += POLL_PAUSE_COUNT_INCREMENT;

				await Promise.resolve();
			},
		};
		runtime.readyOnCheck("postgres", POSTGRES_READY_AFTER_THIRD_CHECK);

		await targetServices(run, runtime, counted).start([postgres]);

		expect(pauses).toBe(expectedPauses);
	};
const targetServicesStartChecksReadinessWithTheServicesOwnCommand =
	async (): Promise<void> => {
		runtime.readyOnCheck("postgres", POSTGRES_READY_AFTER_SECOND_CHECK);

		await targetServices(run, runtime, immediately).start([postgres]);

		expect(runtime.readinessCommands("postgres")).toEqual([
			postgres.ready,
			postgres.ready,
		]);
	};
const targetServicesStartWhenAServiceIsNotReadyWithinItsChecksRefusesToStart =
	async (): Promise<void> => {
		runtime.readyOnCheck(
			"redis",
			immediately.checks + READINESS_CHECK_BEYOND_LIMIT,
		);

		const services = targetServices(run, runtime, immediately);

		const failure = await failureOf(services.start([postgres, redis]));

		expect(failure).toBeInstanceOf(TargetServiceError);
	};
const targetServicesStartWhenAServiceIsNotReadyWithinItsChecksRemovesEveryContainerItStarted =
	async (): Promise<void> => {
		runtime.readyOnCheck(
			"redis",
			immediately.checks + READINESS_CHECK_BEYOND_LIMIT,
		);

		const services = targetServices(run, runtime, immediately);

		await failureOf(services.start([postgres, redis]));

		expect(runtime.runningServices()).toEqual([]);
	};
const targetServicesStartWhenAContainerStopsBeforeItIsReadyRefusesWithoutCheckingItAgain =
	async (): Promise<void> => {
		const expectedReadinessCommandCount = 1;

		runtime.stopBeforeReady("postgres");

		const services = targetServices(run, runtime, immediately);

		const failure = await failureOf(services.start([postgres]));

		expect(failure).toBeInstanceOf(TargetServiceError);
		expect(runtime.readinessCommands("postgres")).toHaveLength(
			expectedReadinessCommandCount,
		);
	};
const targetServicesStartWhenAServiceCannotStartRefusesToStartNamingTheService =
	async (): Promise<void> => {
		runtime.failToStart("redis");

		const services = targetServices(run, runtime, immediately);

		const failure = await failureOf(services.start([postgres, redis]));

		expect(failure).toBeInstanceOf(TargetServiceError);
		expect(failure).toMatchObject({ service: "redis" });
	};
const targetServicesStartWhenAServiceCannotStartRemovesTheContainersStartedBeforeIt =
	async (): Promise<void> => {
		runtime.failToStart("redis");

		const services = targetServices(run, runtime, immediately);

		await failureOf(services.start([postgres, redis]));

		expect(runtime.runningServices()).toEqual([]);
	};
const targetServicesStartWhenAServiceCannotStartAndAContainerCannotBeRemovedReportsBothFailures =
	async (): Promise<void> => {
		runtime.failToStart("redis");
		runtime.failToRemove("postgres");

		const services = targetServices(run, runtime, immediately);

		const failure = await failureOf(services.start([postgres, redis]));

		expect(failure).toBeInstanceOf(TargetServiceError);
		expect(failure).toMatchObject({
			cause: {
				errors: [expect.any(Error), expect.any(TargetServiceError)],
			},
			service: "redis",
		});
	};
describe("targetServices.start readiness", () => {
	beforeEach(() => {
		runtime.reset();
	});
	it(
		"exports each service's address on the port it was given",
		targetServicesStartExportsEachServicesAddressOnThePortItWasGiven,
	);
	it(
		"waits for a service that passes its readiness command on the last check",
		targetServicesStartWaitsForAServiceThatPassesItsReadinessCommandOnTheLastCheck,
	);
	it(
		"pauses after each readiness check that fails",
		targetServicesStartPausesAfterEachReadinessCheckThatFails,
	);
	it(
		"checks readiness with the service's own command",
		targetServicesStartChecksReadinessWithTheServicesOwnCommand,
	);
});
describe("targetServices.start refusals", () => {
	beforeEach(() => {
		runtime.reset();
	});
	describe("when a service is not ready within its checks", () => {
		it(
			"refuses to start",
			targetServicesStartWhenAServiceIsNotReadyWithinItsChecksRefusesToStart,
		);

		it(
			"removes every container it started",
			targetServicesStartWhenAServiceIsNotReadyWithinItsChecksRemovesEveryContainerItStarted,
		);
	});
	describe("when a container stops before it is ready", () => {
		it(
			"refuses without checking it again",
			targetServicesStartWhenAContainerStopsBeforeItIsReadyRefusesWithoutCheckingItAgain,
		);
	});
	describe("when a service cannot start", () => {
		it(
			"refuses to start, naming the service",
			targetServicesStartWhenAServiceCannotStartRefusesToStartNamingTheService,
		);

		it(
			"removes the containers started before it",
			targetServicesStartWhenAServiceCannotStartRemovesTheContainersStartedBeforeIt,
		);
	});
	describe("when a service cannot start and a container cannot be removed", () => {
		it(
			"reports both failures",
			targetServicesStartWhenAServiceCannotStartAndAContainerCannotBeRemovedReportsBothFailures,
		);
	});
});
