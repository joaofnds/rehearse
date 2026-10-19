import { z } from "zod";

interface AppTestTransport {
	readonly request: (
		path: string,
		options?: {
			readonly headers?: Readonly<Record<string, string>>;
			readonly body?: string;
			readonly method?: string;
		},
	) => Response | Promise<Response>;
}
type JsonValue =
	| string
	| number
	| boolean
	| null
	| readonly JsonValue[]
	| { readonly [key: string]: JsonValue };
type JsonBody = Readonly<Record<string, JsonValue>>;
const corpusResponseSchema = z.object({ digest: z.string(), root: z.string() });
type CorpusReading = z.infer<typeof corpusResponseSchema>;

const port = 4173;
const loopback = { host: `127.0.0.1:${String(port)}` };
const sameOrigin = {
	...loopback,
	"content-type": "application/json",
	origin: `http://127.0.0.1:${String(port)}`,
	"sec-fetch-site": "same-origin",
};

interface JsonWrite {
	readonly path: string;
	readonly body: JsonBody;
	readonly headers?: Readonly<Record<string, string>>;
	readonly method?: "POST" | "PUT" | "DELETE";
}

/** Owns HTTP encoding and browser headers while returning refused responses intact. */
class AppHttpDriver {
	public constructor(private readonly app: AppTestTransport) {}

	public async read(
		path: string,
		headers: Readonly<Record<string, string>> = loopback,
	): Promise<Response> {
		return await this.app.request(path, { headers });
	}

	public async writeJson({
		path,
		body,
		headers = sameOrigin,
		method = "POST",
	}: JsonWrite): Promise<Response> {
		return await this.app.request(path, {
			body: JSON.stringify(body),
			headers,
			method,
		});
	}

	public async launch(
		body: JsonBody,
		headers: Readonly<Record<string, string>> = sameOrigin,
	): Promise<Response> {
		return await this.writeJson({
			body,
			headers,
			path: "/api/launches",
		});
	}

	public async stopLaunch(
		id: string,
		headers: Readonly<Record<string, string>> = sameOrigin,
	): Promise<Response> {
		return await this.writeJson({
			body: {},
			headers,
			path: `/api/launches/${id}/stop`,
		});
	}

	public async declareCase(
		body: JsonBody,
		headers: Readonly<Record<string, string>> = sameOrigin,
	): Promise<Response> {
		return await this.writeJson({
			body,
			headers,
			path: "/api/cases",
		});
	}
}

export {
	AppHttpDriver as default,
	port,
	loopback,
	sameOrigin,
	corpusResponseSchema,
};
export type { CorpusReading };
