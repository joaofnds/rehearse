import { describe, expect, it } from "bun:test";

import {
	dockerRunArguments,
	ownedContainersIn,
	publishedHostPort,
} from "./docker-container-runtime";

describe(dockerRunArguments.name, () => {
	it("publishes the service on a loopback port, labeled with its owner", () => {
		const postgres = {
			env: { POSTGRES_DB: "app" },
			exports: {},
			image: "postgres:18-alpine",
			name: "postgres",
			port: 5432,
			ready: ["pg_isready"],
		};

		const args = dockerRunArguments(postgres, {
			attempt: "group-1-rep-1",
			run: "group-1",
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
		const expectedPublishedHostPort = 32_768;

		expect(publishedHostPort("127.0.0.1:32768\n")).toBe(
			expectedPublishedHostPort,
		);
	});

	it("refuses output that names no port", () => {
		expect(() => publishedHostPort("")).toThrow(/published port/u);
	});
});
