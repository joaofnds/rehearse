import type { MiddlewareHandler } from "hono";

const READ_METHODS = new Set(["GET", "HEAD"]);

/**
 * Only a Host naming the loopback address and port the server listens on is
 * served, on every route. A page on another site can make the browser send
 * requests to 127.0.0.1 under its own DNS name once that name resolves there,
 * and the Host header is the one part of such a request that still carries
 * the foreign name.
 *
 * A request that writes must also come from the client this server serves. A
 * page on another site can post a form to 127.0.0.1 without a preflight, and
 * a form cannot send a JSON content type, so the content type, the exact
 * Origin, and the browser's Sec-Fetch-Site each refuse it. A page on
 * another site can still frame the client and steer the operator's click
 * onto Start, and that request is the client's own, so every response
 * forbids framing.
 */
export function requestGuard(port: number): MiddlewareHandler {
	const allowed = new Set([
		`127.0.0.1:${String(port)}`,
		`localhost:${String(port)}`,
	]);

	return (context, next) => {
		context.header("X-Frame-Options", "DENY");
		context.header("Content-Security-Policy", "frame-ancestors 'none'");
		const host = context.req.header("host") ?? "";
		if (!allowed.has(host)) {
			return Promise.resolve(
				context.text("Forbidden: not a loopback host", 403),
			);
		}
		if (
			!READ_METHODS.has(context.req.method) &&
			!sameOriginJson(
				{
					origin: context.req.header("origin"),
					fetchSite: context.req.header("sec-fetch-site"),
					contentType: context.req.header("content-type"),
				},
				host,
			)
		) {
			return Promise.resolve(
				context.text("Forbidden: not a same-origin JSON request", 403),
			);
		}

		return next();
	};
}

interface WriteHeaders {
	readonly origin: string | undefined;
	readonly fetchSite: string | undefined;
	readonly contentType: string | undefined;
}

/** A browser that sends no Sec-Fetch-Site is judged on the rest alone. */
function sameOriginJson(headers: WriteHeaders, host: string): boolean {
	const mediaType = (headers.contentType ?? "").split(";")[0] ?? "";

	return (
		headers.origin === `http://${host}` &&
		(headers.fetchSite ?? "same-origin") === "same-origin" &&
		mediaType.trim().toLowerCase() === "application/json"
	);
}
