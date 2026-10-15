import { beforeEach, describe, expect, it } from "bun:test";
import type { TargetService } from "./pipeline";
import {
	TargetServiceError,
	checksWithServices,
	targetServices,
} from "./target-services";
import type { ContainerOwner, ServiceReadiness } from "./target-services";
import { FakeContainerRuntime } from "./target-services-test-support";
import { failureOf } from "#cli/cli-test-support";

const postgres: TargetService = {
	name: "postgres",
	image: "postgres:18-alpine",
	port: 5432,
	ready: ["pg_isready", "-h", "127.0.0.1"],
	exports: { DATABASE_URL: "postgres://127.0.0.1:{port}/app" },
};
const redis: TargetService = {
	name: "redis",
	image: "redis:8-alpine",
	port: 6379,
	ready: ["redis-cli", "ping"],
	exports: { REDIS_URL: "redis://127.0.0.1:{port}" },
};
const immediately: ServiceReadiness = {
	checks: 3,
	wait: () => Promise.resolve(),
};
const run: ContainerOwner = { run: "run-1", attempt: "run-1" };
const otherAttempt: ContainerOwner = {
	run: "group-1",
	attempt: "group-1-rep-1",
};

describe(targetServices.name, () => {
	const runtime = new FakeContainerRuntime();

	beforeEach(() => {
		runtime.reset();
	});

	describe("start", () => {
		it("exports each service's address on the port it was given", async () => {
			const services = targetServices(run, runtime, immediately);

			const environment = await services.start([postgres, redis]);

			expect(environment).toEqual({
				DATABASE_URL: "postgres://127.0.0.1:49152/app",
				REDIS_URL: "redis://127.0.0.1:49153",
			});
		});

		it("waits for a service that passes its readiness command on the last check", async () => {
			runtime.readyOnCheck("postgres", immediately.checks);
			const services = targetServices(run, runtime, immediately);

			const environment = await services.start([postgres]);

			expect(Object.keys(environment)).toEqual(["DATABASE_URL"]);
		});

		it("pauses after each readiness check that fails", async () => {
			let pauses = 0;
			const counted: ServiceReadiness = {
				checks: 3,
				wait: () => {
					pauses += 1;

					return Promise.resolve();
				},
			};
			runtime.readyOnCheck("postgres", 3);

			await targetServices(run, runtime, counted).start([postgres]);

			expect(pauses).toBe(2);
		});

		it("checks readiness with the service's own command", async () => {
			runtime.readyOnCheck("postgres", 2);

			await targetServices(run, runtime, immediately).start([postgres]);

			expect(runtime.readinessCommands("postgres")).toEqual([
				postgres.ready,
				postgres.ready,
			]);
		});

		describe("when a service is not ready within its checks", () => {
			it("refuses to start", async () => {
				runtime.readyOnCheck("redis", immediately.checks + 1);
				const services = targetServices(run, runtime, immediately);

				const failure = await failureOf(services.start([postgres, redis]));

				expect(failure).toBeInstanceOf(TargetServiceError);
			});

			it("removes every container it started", async () => {
				runtime.readyOnCheck("redis", immediately.checks + 1);
				const services = targetServices(run, runtime, immediately);

				await failureOf(services.start([postgres, redis]));

				expect(runtime.runningServices()).toEqual([]);
			});
		});

		describe("when a container stops before it is ready", () => {
			it("refuses without checking it again", async () => {
				runtime.stopBeforeReady("postgres");
				const services = targetServices(run, runtime, immediately);

				const failure = await failureOf(services.start([postgres]));

				expect(failure).toBeInstanceOf(TargetServiceError);
				expect(runtime.readinessCommands("postgres")).toHaveLength(1);
			});
		});

		describe("when a service cannot start", () => {
			it("refuses to start, naming the service", async () => {
				runtime.failToStart("redis");
				const services = targetServices(run, runtime, immediately);

				const failure = await failureOf(services.start([postgres, redis]));

				expect(failure).toBeInstanceOf(TargetServiceError);
				expect(failure).toMatchObject({ service: "redis" });
			});

			it("removes the containers started before it", async () => {
				runtime.failToStart("redis");
				const services = targetServices(run, runtime, immediately);

				await failureOf(services.start([postgres, redis]));

				expect(runtime.runningServices()).toEqual([]);
			});
		});

		describe("when a service cannot start and a container cannot be removed", () => {
			it("reports both failures", async () => {
				runtime.failToStart("redis");
				runtime.failToRemove("postgres");
				const services = targetServices(run, runtime, immediately);

				const failure = await failureOf(services.start([postgres, redis]));

				expect(failure).toBeInstanceOf(TargetServiceError);
				expect(failure).toMatchObject({
					service: "redis",
					cause: {
						errors: [expect.any(Error), expect.any(TargetServiceError)],
					},
				});
			});
		});
	});

	describe("stop", () => {
		it("removes every container it started", async () => {
			const services = targetServices(run, runtime, immediately);
			await services.start([postgres, redis]);

			await services.stop();

			expect(runtime.runningServices()).toEqual([]);
		});

		it("removes a container whose start has not returned", async () => {
			runtime.hangOnStart("redis");
			const services = targetServices(run, runtime, immediately);
			void services.start([postgres, redis]);
			await runtime.startRequested("redis");

			await services.stop();

			expect(runtime.runningServices()).toEqual([]);
		});

		it("leaves another attempt's containers running", async () => {
			await targetServices(otherAttempt, runtime, immediately).start([redis]);
			const services = targetServices(run, runtime, immediately);
			await services.start([postgres]);

			await services.stop();

			expect(runtime.runningServices()).toEqual(["redis"]);
		});

		describe("when a container cannot be removed", () => {
			it("still removes the others", async () => {
				runtime.failToRemove("postgres");
				const services = targetServices(run, runtime, immediately);
				await services.start([postgres, redis]);

				await failureOf(services.stop());

				expect(runtime.runningServices()).toEqual(["postgres"]);
			});

			it("reports the service it left running", async () => {
				runtime.failToRemove("postgres");
				const services = targetServices(run, runtime, immediately);
				await services.start([postgres, redis]);

				const failure = await failureOf(services.stop());

				expect(failure).toBeInstanceOf(TargetServiceError);
				expect(failure).toMatchObject({ service: "postgres" });
			});
		});
	});
});

describe(checksWithServices.name, () => {
	const environment = { DATABASE_URL: "postgres://127.0.0.1:49152/app" };

	it("gives each check the services' environment", () => {
		const checks = [
			{ command: ["bun", "test"], env: { CONFIG_PATH: "test.yaml" } },
		];

		expect(checksWithServices(checks, environment)).toEqual([
			{
				command: ["bun", "test"],
				env: {
					DATABASE_URL: "postgres://127.0.0.1:49152/app",
					CONFIG_PATH: "test.yaml",
				},
			},
		]);
	});

	it("keeps a check's own value for a variable a service exports", () => {
		const checks = [
			{
				command: ["bun", "test"],
				env: { DATABASE_URL: "postgres://elsewhere/app" },
			},
		];

		expect(checksWithServices(checks, environment)).toEqual(checks);
	});
});
