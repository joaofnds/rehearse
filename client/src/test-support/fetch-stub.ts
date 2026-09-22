import type { InferResponseType } from "hono/client";
import type { apiClient } from "#client/api-client";

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
