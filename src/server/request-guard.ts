import type { MiddlewareHandler } from "hono";

/**
 * Only a Host naming the loopback address and port the server listens on is
 * served, on every route. A page on another site can make the browser send
 * requests to 127.0.0.1 under its own DNS name once that name resolves there,
 * and the Host header is the one part of such a request that still carries
 * the foreign name.
 */
export function loopbackHostGuard(port: number): MiddlewareHandler {
	const allowed = new Set([
		`127.0.0.1:${String(port)}`,
		`localhost:${String(port)}`,
	]);

	return (context, next) => {
		if (!allowed.has(context.req.header("host") ?? "")) {
			return Promise.resolve(
				context.text("Forbidden: not a loopback host", 403),
			);
		}

		return next();
	};
}
