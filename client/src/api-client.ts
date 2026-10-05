import { hc } from "hono/client";
import type { ApiRoutes } from "#server/api";
import type { CalibrationRoutes } from "#server/calibration";
import type { LaunchRoutes } from "#server/launches";

/**
 * The one Hono RPC client every screen fetches through, so a response shape
 * comes from the server's own route declaration (`ApiRoutes`) rather than
 * being redeclared by hand on the client, which is decision-3's stated reason
 * for choosing Hono over an alternative with no RPC client.
 */
export const apiClient = hc<ApiRoutes>("");

/**
 * The launch routes' client, typed from `LaunchRoutes` for the same reason.
 * The server's request guard refuses a write that is not JSON even when it
 * carries no body, such as a stop or an unlink, so every request says JSON.
 */
export const launchClient = hc<LaunchRoutes>("", {
	headers: { "content-type": "application/json" },
});

/** The calibration routes' client, typed from `CalibrationRoutes` for the same reason. */
export const calibrationClient = hc<CalibrationRoutes>("");
