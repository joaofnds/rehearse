import ScreenHeader from "#client/system/components/screen-header";

import { Subline } from "./calibration-agreement";
import type { CalibrationResponse } from "./calibration-query";
import { ReviewNext } from "./calibration-report";

interface EmbeddedCalibrationHeaderProps {
	readonly report: CalibrationResponse | undefined;
}

function EmbeddedCalibrationHeader({
	report,
}: EmbeddedCalibrationHeaderProps): React.JSX.Element {
	return (
		<div className="flex flex-wrap items-end justify-between gap-3 page-gutter pt-4">
			<div>
				<h2 className="text-16 font-semibold">Judge calibration</h2>
				{report === undefined ? null : (
					<p className="mt-1 text-12 text-dim">
						<Subline
							reviews={report.reviews}
							withinOneStep={report.withinOneStep}
						/>
					</p>
				)}
			</div>
			{report === undefined ? null : (
				<ReviewNext next={report.next} reviews={report.reviews} />
			)}
		</div>
	);
}

interface CalibrationHeaderProps {
	readonly report: CalibrationResponse | undefined;
}

function CalibrationHeader({
	report,
}: CalibrationHeaderProps): React.JSX.Element {
	return (
		<ScreenHeader
			title="Judge calibration"
			subline={
				report === undefined ? undefined : (
					<Subline
						reviews={report.reviews}
						withinOneStep={report.withinOneStep}
					/>
				)
			}
			aside={
				report === undefined ? undefined : (
					<ReviewNext next={report.next} reviews={report.reviews} />
				)
			}
		/>
	);
}

export { CalibrationHeader, EmbeddedCalibrationHeader };
