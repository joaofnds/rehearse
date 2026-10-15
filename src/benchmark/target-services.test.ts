import { beforeEach, describe, expect, it } from "bun:test";
import type { TargetService } from "./pipeline";
import {
	TargetServiceError,
	checksWithServices,
	startServices,
} from "./target-services";
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
const immediately = { checks: 3, wait: () => Promise.resolve() };

describe(startServices.name, () => {
	const runtime = new FakeContainerRuntime();

	beforeEach(() => {
		runtime.reset();
	});

	it("exports each service's address on the port it was given", async () => {
		const services = await startServices(
			[postgres, redis],
			runtime,
			immediately,
		);

		expect(services.environment).toEqual({
			DATABASE_URL: "postgres://127.0.0.1:49152/app",
			REDIS_URL: "redis://127.0.0.1:49153",
		});
	});

	it("waits for a service that passes its readiness command on the last check", async () => {
		runtime.readyOnCheck("postgres", immediately.checks);

		const services = await startServices([postgres], runtime, immediately);

		expect(Object.keys(services.environment)).toEqual(["DATABASE_URL"]);
	});

	it("stops by removing every container it started", async () => {
		const services = await startServices(
			[postgres, redis],
			runtime,
			immediately,
		);

		await services.stop();

		expect(runtime.runningServices()).toEqual([]);
	});

	describe("when a container cannot be removed", () => {
		it("still removes the others", async () => {
			runtime.failToRemove("postgres");
			const services = await startServices(
				[postgres, redis],
				runtime,
				immediately,
			);

			await services.stop().catch(() => undefined);

			expect(runtime.runningServices()).toEqual(["postgres"]);
		});

		it("reports the service it left running", async () => {
			runtime.failToRemove("postgres");
			const services = await startServices(
				[postgres, redis],
				runtime,
				immediately,
			);

			const failure = await failureOf(services.stop());

			expect(failure).toBeInstanceOf(TargetServiceError);
			expect(failure).toMatchObject({ service: "postgres" });
		});
	});

	describe("when a service is not ready within its checks", () => {
		it("refuses to start", async () => {
			runtime.readyOnCheck("redis", immediately.checks + 1);

			const failure = await failureOf(
				startServices([postgres, redis], runtime, immediately),
			);

			expect(failure).toBeInstanceOf(TargetServiceError);
		});

		it("removes every container it started", async () => {
			runtime.readyOnCheck("redis", immediately.checks + 1);

			await startServices([postgres, redis], runtime, immediately).catch(
				() => undefined,
			);

			expect(runtime.runningServices()).toEqual([]);
		});
	});

	describe("when a service cannot start", () => {
		it("refuses to start, naming the service", async () => {
			runtime.failToStart("redis");

			const failure = await failureOf(
				startServices([postgres, redis], runtime, immediately),
			);

			expect(failure).toBeInstanceOf(TargetServiceError);
			expect(failure).toMatchObject({ service: "redis" });
		});

		it("removes the containers started before it", async () => {
			runtime.failToStart("redis");

			await startServices([postgres, redis], runtime, immediately).catch(
				() => undefined,
			);

			expect(runtime.runningServices()).toEqual([]);
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
