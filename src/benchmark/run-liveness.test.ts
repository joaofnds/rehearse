import { describe, expect, it } from "bun:test";

import { liveRunLiveness } from "./run-liveness";

const INIT_PID = 1;

describe(liveRunLiveness.name, () => {
	it("reads the process this one is as alive", () => {
		expect(liveRunLiveness().isAlive(process.pid)).toBe(true);
	});

	it("reads a pid no process holds as dead", async () => {
		const exited = Bun.spawn(["true"]);
		await exited.exited;

		expect(liveRunLiveness().isAlive(exited.pid)).toBe(false);
	});

	/**
	 * Signal 0 to another user's process is refused with EPERM, which means
	 * the process exists. A run started by another user would otherwise read
	 * as ended while it executes.
	 */
	it("reads a process another user owns as alive", () => {
		expect(liveRunLiveness().isAlive(INIT_PID)).toBe(true);
	});
});
