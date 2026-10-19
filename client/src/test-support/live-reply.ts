import type { Reply } from "./fetch-stub";

/** A reply read when the request arrives, for a route a write changes. */
class LiveReply {
	public constructor(private readonly read: () => Reply) {}

	public current(): Reply {
		return this.read();
	}
}

export { LiveReply as default };
