import type ApiHttpDriver from "#server/api-test-http-driver";

const STREAM_WRITE_TIMEOUT_MS = 2000;

async function timeout(): Promise<string> {
	await Bun.sleep(STREAM_WRITE_TIMEOUT_MS);

	return "nothing written within 2 s";
}

/** Owns the abort signal and response reader of one open SSE connection. */
class ApiEventReader implements AsyncDisposable {
	private readonly reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
	public readonly response: {
		readonly status: number;
		readonly contentType: string | null;
	};

	private constructor(
		private readonly props: {
			readonly body: Readonly<
				Pick<ReadableStream<Uint8Array>, "getReader">
			> | null;
			readonly status: number;
			readonly contentType: string | null;
			readonly abort: () => void;
		},
	) {
		this.response = { contentType: props.contentType, status: props.status };
		this.reader = props.body?.getReader();
	}

	public static async open(
		app: Readonly<ApiHttpDriver>,
		runId: string,
	): Promise<ApiEventReader> {
		const controller = new AbortController();
		try {
			const response = await app.events(runId, controller.signal);

			return new ApiEventReader({
				abort: () => {
					controller.abort();
				},
				body: response.body,
				contentType: response.headers.get("content-type"),
				status: response.status,
			});
		} catch (error) {
			controller.abort();
			throw error;
		}
	}

	private async read(): Promise<string> {
		const chunk = await this.reader?.read();

		return new TextDecoder().decode(chunk?.value);
	}

	public async nextWrite(): Promise<string> {
		return await Promise.race([this.read(), timeout()]);
	}

	public async [Symbol.asyncDispose](): Promise<void> {
		this.props.abort();
		await this.reader?.cancel();
	}
}

export { ApiEventReader as default };
