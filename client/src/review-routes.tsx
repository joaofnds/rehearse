import { createRoute } from "@tanstack/react-router";

import CalibrationPage from "#client/calibration/calibration-page";
import StageReviewPage from "#client/calibration/stage-review-page";

import { rootRoute } from "./section-routes";

const calibrationRoute = createRoute({
	component: CalibrationPage,
	getParentRoute: () => rootRoute,
	path: "/calibration",
});

const runStageReviewRoute = createRoute({
	component: RunStageReviewRoute,
	getParentRoute: () => rootRoute,
	path: "/calibration/runs/$run/stages/$stage",
});

function RunStageReviewRoute(): React.JSX.Element {
	const params: { readonly run: string; readonly stage: string } =
		runStageReviewRoute.useParams();

	return <StageReviewPage stage={{ kind: "run", ...params }} />;
}

const repStageReviewRoute = createRoute({
	component: RepStageReviewRoute,
	getParentRoute: () => rootRoute,
	path: "/calibration/groups/$groupId/reps/$repId/stages/$stage",
});

function RepStageReviewRoute(): React.JSX.Element {
	const params: {
		readonly groupId: string;
		readonly repId: string;
		readonly stage: string;
	} = repStageReviewRoute.useParams();

	return <StageReviewPage stage={{ kind: "rep", ...params }} />;
}

const replayStageReviewRoute = createRoute({
	component: ReplayStageReviewRoute,
	getParentRoute: () => rootRoute,
	path: "/calibration/replays/$lineage/$timestamp",
});

function ReplayStageReviewRoute(): React.JSX.Element {
	const params: { readonly lineage: string; readonly timestamp: string } =
		replayStageReviewRoute.useParams();

	return <StageReviewPage stage={{ kind: "replay", ...params }} />;
}

export {
	calibrationRoute,
	replayStageReviewRoute,
	repStageReviewRoute,
	runStageReviewRoute,
};
