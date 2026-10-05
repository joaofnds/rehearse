import type { InferResponseType } from "hono/client";
import type { apiClient } from "#client/api-client";
import { LiveReply } from "./live-reply";

type RunHistoryResponseBody = InferResponseType<typeof apiClient.api.runs.$get>;

/**
 * A one-shot `fetch` stub for the `/api/runs` response shape, typed to
 * satisfy Bun's `typeof fetch` (which carries a `preconnect` static member no
 * stub function has by default). Callers restore `globalThis.fetch`
 * themselves, typically in `afterEach`.
 */
export function stubFetch(body: RunHistoryResponseBody): void {
	const stub = (): Promise<Response> => Promise.resolve(Response.json(body));
	stub.preconnect = fetch.preconnect;
	globalThis.fetch = stub;
}

/**
 * A `fetch` stub for a page that calls more than one endpoint, keyed by
 * pathname rather than by response shape: each entry supplies the exact body
 * its own route's test already types against the server's response schema, so
 * this stub adds no shape of its own to get wrong.
 *
 * An unmapped path answers 404 rather than a 200 carrying `undefined`,
 * because a page that tells a failed load apart from an empty record can only
 * be observed against a response that is not ok.
 */
export function stubFetchByPath(byPath: ReadonlyMap<string, unknown>): void {
	const stub = (request: string | URL | Request): Promise<Response> => {
		const { pathname } = new URL(
			request instanceof Request ? request.url : request,
			"http://localhost",
		);
		const body = byPath.get(pathname);
		if (body === undefined) {
			return Promise.resolve(
				Response.json({ error: "not found" }, { status: 404 }),
			);
		}

		return Promise.resolve(Response.json(body));
	};
	stub.preconnect = fetch.preconnect;
	globalThis.fetch = stub;
}

export interface SentRequest {
	readonly method: string;
	readonly pathname: string;
	readonly contentType: string | null;
	body: string;
}

export interface Reply {
	readonly status: number;
	readonly body: unknown;
}

/**
 * A `fetch` Fake for a page that writes as well as reads: each route, keyed
 * `"METHOD /path"`, answers with its status and body, sent as JSON unless it
 * is bytes, and every request is
 * kept in `sent` so a test can read what the page posted. An unmapped route
 * answers 404, as `stubFetchByPath` does.
 */
export class FakeServer {
	public readonly sent: SentRequest[] = [];

	public constructor(
		private readonly routes: ReadonlyMap<string, Reply | LiveReply>,
	) {}

	public install(): void {
		const stub = Object.assign(
			async (
				input: string | URL | Request,
				init?: RequestInit,
			): Promise<Response> => {
				const url = new URL(
					input instanceof Request ? input.url : input,
					"http://localhost",
				);
				const request = new Request(url, init);
				// Kept before the first await, so a request is in `sent` the
				// moment the page makes it; its body is filled in once read.
				const sent = {
					method: request.method,
					pathname: url.pathname,
					contentType: request.headers.get("content-type"),
					body: "",
				};
				this.sent.push(sent);
				sent.body = await request.text();
				const route = this.routes.get(`${request.method} ${url.pathname}`) ?? {
					status: 404,
					body: { error: "not found" },
				};
				const reply = route instanceof LiveReply ? route.current() : route;

				return reply.body instanceof Uint8Array
					? new Response(Uint8Array.from(reply.body), { status: reply.status })
					: Response.json(reply.body, { status: reply.status });
			},
			{ preconnect: fetch.preconnect },
		);
		globalThis.fetch = stub;
	}

	public posted(pathname: string): readonly SentRequest[] {
		return this.sent.filter(
			(request) => request.method === "POST" && request.pathname === pathname,
		);
	}
}
