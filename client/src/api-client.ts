import { hc } from "hono/client";
import type { ApiRoutes } from "#server/api";
import type { LaunchRoutes } from "#server/launches";

/**
 * The one Hono RPC client every screen fetches through, so a response shape
 * comes from the server's own route declaration (`ApiRoutes`) rather than
 * being redeclared by hand on the client, which is decision-3's stated reason
 * for choosing Hono over an alternative with no RPC client.
 */
export const apiClient = hc<ApiRoutes>("");

/** The launch routes' client, typed from `LaunchRoutes` for the same reason. */
export const launchClient = hc<LaunchRoutes>("");
