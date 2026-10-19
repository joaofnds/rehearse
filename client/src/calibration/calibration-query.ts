import type { InferResponseType } from "hono/client";

import { calibrationClient } from "#client/api-client";

type CalibrationResponse = InferResponseType<
	typeof calibrationClient.api.calibration.$get
>;

async function fetchCalibration(): Promise<CalibrationResponse> {
	const response = await calibrationClient.api.calibration.$get();
	if (!response.ok) {
		throw new Error("Could not load the calibration report");
	}

	return await response.json();
}

const calibrationQuery = {
	queryFn: fetchCalibration,
	queryKey: ["calibration"],
} as const;

export { calibrationQuery as default };
export type { CalibrationResponse };
