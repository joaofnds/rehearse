import type { InferResponseType } from "hono/client";
import { calibrationClient } from "#client/api-client";

export type CalibrationResponse = InferResponseType<
	typeof calibrationClient.api.calibration.$get
>;

async function fetchCalibration(): Promise<CalibrationResponse> {
	const response = await calibrationClient.api.calibration.$get();
	if (!response.ok) {
		throw new Error("Could not load the calibration report");
	}

	return response.json();
}

export const calibrationQuery = {
	queryKey: ["calibration"],
	queryFn: fetchCalibration,
} as const;
