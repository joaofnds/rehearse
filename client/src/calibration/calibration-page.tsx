import { useQuery } from "@tanstack/react-query";

import {
	CalibrationHeader,
	EmbeddedCalibrationHeader,
} from "./calibration-header";
import calibrationQuery from "./calibration-query";
import { CalibrationReport } from "./calibration-report";

interface CalibrationPageProps {
	readonly embedded?: boolean;
}

function CalibrationPage({
	embedded = false,
}: CalibrationPageProps): React.JSX.Element {
	const query = useQuery(calibrationQuery);
	const report = query.data;

	return (
		<div>
			{embedded ? (
				<EmbeddedCalibrationHeader report={report} />
			) : (
				<CalibrationHeader report={report} />
			)}

			<div className="page-gutter pt-3.5 pb-9">
				{query.isLoading ? (
					<p className="text-muted-foreground">Loading…</p>
				) : null}
				{query.isError ? (
					<p role="alert" className="text-attention">
						<span aria-hidden="true">⚠ </span>
						Could not load the calibration report.
					</p>
				) : null}

				{report === undefined ? null : <CalibrationReport report={report} />}
			</div>
		</div>
	);
}

export { CalibrationPage as default };
