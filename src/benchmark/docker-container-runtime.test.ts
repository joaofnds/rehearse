import { describe, expect, it } from "bun:test";
import { publishedHostPort } from "./docker-container-runtime";

describe(publishedHostPort.name, () => {
	it("reads the host port docker published on the loopback address", () => {
		expect(publishedHostPort("127.0.0.1:32768\n")).toBe(32_768);
	});

	it("refuses output that names no port", () => {
		expect(() => publishedHostPort("")).toThrow(/published port/u);
	});
});
