import type { Env, Hono, Schema } from "hono";

/** Keeps Hono's inferred route schema in the factory's return contract. */
function routes<Dependencies, Routes extends Schema>(
	build: (dependencies: Dependencies) => Hono<Env, Routes>,
): (dependencies: Dependencies) => Hono<Env, Routes> {
	return build;
}

export { routes as default };
