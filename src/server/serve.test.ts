import { describe, expect, it } from "bun:test";
import { startLocalServer } from "./serve";

describe(startLocalServer.name, () => {
	it("binds the browser server to IPv4 loopback", async () => {
		const server = startLocalServer(0, () => new Response("ready"));

		try {
			expect(server.hostname).toBe("127.0.0.1");
			expect(
				await fetch(`http://127.0.0.1:${String(server.port)}`).then(
					(response) => response.text(),
				),
			).toBe("ready");
		} finally {
			await server.stop(true);
		}
	});
});
