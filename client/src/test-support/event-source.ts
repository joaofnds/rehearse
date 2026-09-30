/**
 * The browser's EventSource as a test drives it: happy-dom has none, so the
 * test setup installs this one, and a test delivers an event to a stream it
 * finds open, as the server would.
 */
export class FakeEventSource {
	public static opened: FakeEventSource[] = [];

	public closed = false;

	private readonly listeners: (() => void)[] = [];

	public constructor(public readonly url: string) {
		FakeEventSource.opened.push(this);
	}

	/** The one stream still open on `url`. */
	public static openOn(url: string): FakeEventSource {
		const source = FakeEventSource.opened.find(
			(opened) => opened.url === url && !opened.closed,
		);
		if (source === undefined) {
			throw new Error(`no stream is open on ${url}`);
		}

		return source;
	}

	public addEventListener(type: "message", listener: () => void): void {
		if (type === "message") {
			this.listeners.push(listener);
		}
	}

	public close(): void {
		this.closed = true;
	}

	/** An event reaches the stream. The monitor reads none of its data. */
	public deliver(): void {
		for (const listener of this.listeners) {
			listener();
		}
	}
}
