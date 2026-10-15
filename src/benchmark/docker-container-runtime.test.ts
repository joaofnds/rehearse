import { describe, expect, it } from "bun:test";
import {
	dockerRunArguments,
	ownedContainersIn,
	publishedHostPort,
} from "./docker-container-runtime";

describe(dockerRunArguments.name, () => {
	it("publishes the service on a loopback port, labeled with its owner", () => {
		const postgres = {
			name: "postgres",
			image: "postgres:18-alpine",
			port: 5432,
			env: { POSTGRES_DB: "app" },
			ready: ["pg_isready"],
			exports: {},
		};

		const args = dockerRunArguments(postgres, {
			run: "group-1",
			attempt: "group-1-rep-1",
		});

		expect(args).toEqual([
			"run",
			"--detach",
			"--label",
			"rehearse.run=group-1",
			"--label",
			"rehearse.attempt=group-1-rep-1",
			"--label",
			"rehearse.service=postgres",
			"--publish",
			"127.0.0.1::5432",
			"--env",
			"POSTGRES_DB=app",
			"postgres:18-alpine",
		]);
	});
});

describe(ownedContainersIn.name, () => {
	it("reads each container's id and service from docker ps output", () => {
		const output = "88cb999dc2ae postgres\nf740aac89fc6 redis\n";

		expect(ownedContainersIn(output)).toEqual([
			{ id: "88cb999dc2ae", service: "postgres" },
			{ id: "f740aac89fc6", service: "redis" },
		]);
	});

	it("reads no containers from empty output", () => {
		expect(ownedContainersIn("")).toEqual([]);
	});
});

describe(publishedHostPort.name, () => {
	it("reads the host port docker published on the loopback address", () => {
		expect(publishedHostPort("127.0.0.1:32768\n")).toBe(32_768);
	});

	it("refuses output that names no port", () => {
		expect(() => publishedHostPort("")).toThrow(/published port/u);
	});
});
