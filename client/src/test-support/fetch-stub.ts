import type { InferResponseType } from "hono/client";

import type { apiClient } from "#client/api-client";

import LiveReply from "./live-reply";

type RunHistoryResponseBody = InferResponseType<typeof apiClient.api.runs.$get>;

/**
 * A one-shot `fetch` stub for the `/api/runs` response shape, typed to
 * satisfy Bun's `typeof fetch` (which carries a `preconnect` static member no
 * stub function has by default). Callers restore `globalThis.fetch`
 * themselves, typically in `afterEach`.
 */
function stubFetch(body: RunHistoryResponseBody): void {
	const stub = async (request: string | URL | Request): Promise<Response> => {
		const { pathname } = new URL(
			request instanceof Request ? request.url : request,
			"http://localhost",
		);
		if (pathname === "/api/confirmation-archives") {
			return await Promise.resolve(
				Response.json({ archived: [], unreadable: [] }),
			);
		}
		return await Promise.resolve(
			Response.json(
				pathname === "/api/run-staleness" ? stalenessBody(body) : body,
			),
		);
	};
	stub.preconnect = fetch.preconnect;
	globalThis.fetch = stub;
}

/** The separate list and freshness routes projected from one typed history fixture. */
function runHistoryReplies(
	history: RunHistoryResponseBody,
): ReadonlyMap<string, unknown> {
	return new Map<string, unknown>([
		["/api/confirmation-archives", { archived: [], unreadable: [] }],
		["/api/runs", history],
		["/api/run-listing", history],
		["/api/run-staleness", stalenessBody(history)],
	]);
}

type RunStalenessBody = InferResponseType<
	(typeof apiClient.api)["run-staleness"]["$get"]
>;

function stalenessBody(history: RunHistoryResponseBody): RunStalenessBody {
	return {
		records: Object.fromEntries(
			history.rows.map((row) => [row.recordId, row.staleness]),
		),
	};
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
function stubFetchByPath(byPath: ReadonlyMap<string, unknown>): void {
	const stub = async (request: string | URL | Request): Promise<Response> => {
		const { pathname } = new URL(
			request instanceof Request ? request.url : request,
			"http://localhost",
		);
		const body = byPath.get(pathname);
		if (body === undefined) {
			return await Promise.resolve(
				Response.json({ error: "not found" }, { status: 404 }),
			);
		}

		return await Promise.resolve(Response.json(body));
	};
	stub.preconnect = fetch.preconnect;
	globalThis.fetch = stub;
}

interface SentRequest {
	readonly method: string;
	readonly pathname: string;
	/** The query string, with its leading `?`, or empty. */
	readonly search: string;
	readonly contentType: string | null;
	body: string;
}

interface Reply {
	readonly status: number;
	readonly body: unknown;
	readonly headers?: Readonly<Record<string, string>>;
}

const READ_METHODS = new Set(["GET", "HEAD"]);

function isJson(contentType: string | null): boolean {
	const [mediaType] = contentType?.split(";") ?? [];
	return mediaType?.trim().toLowerCase() === "application/json";
}

/**
 * A `fetch` Fake for a page that writes as well as reads: each route, keyed
 * `"METHOD /path"`, answers with its status and body, sent as JSON unless it
 * is bytes, and every request is
 * kept in `sent` so a test can read what the page posted. An unmapped route
 * answers 404, as `stubFetchByPath` does. A write that is not JSON answers
 * the server's request guard's 403, so a request the guard would refuse
 * fails here too.
 */
class FakeServer {
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
					body: "",
					contentType: request.headers.get("content-type"),
					method: request.method,
					pathname: url.pathname,
					search: url.search,
				};
				this.sent.push(sent);
				sent.body = await request.text();
				if (!READ_METHODS.has(request.method) && !isJson(sent.contentType)) {
					return new Response("Forbidden: not a same-origin JSON request", {
						status: 403,
					});
				}
				const route = this.routes.get(`${request.method} ${url.pathname}`) ?? {
					body: { error: "not found" },
					status: 404,
				};
				const reply = route instanceof LiveReply ? route.current() : route;

				return replyResponse(reply);
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

function replyResponse(reply: Reply): Response {
	const options = { headers: reply.headers ?? {}, status: reply.status };

	return reply.body instanceof Uint8Array
		? new Response(Uint8Array.from(reply.body), options)
		: Response.json(reply.body, options);
}

export {
	FakeServer,
	runHistoryReplies,
	stalenessBody,
	stubFetch,
	stubFetchByPath,
};
export type { Reply, SentRequest };
