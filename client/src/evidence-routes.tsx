import { createRoute } from "@tanstack/react-router";

import EvidenceSourcePage from "#client/evidence/evidence-source-page";

import { rootRoute } from "./section-routes";

const stageEvidenceRoute = createRoute({
	component: StageEvidenceRoute,
	getParentRoute: () => rootRoute,
	path: "/runs/$run/stages/$stage/evidence/$section/$item/$index",
});

function StageEvidenceRoute(): React.JSX.Element {
	const params: {
		readonly run: string;
		readonly stage: string;
		readonly section: string;
		readonly item: string;
		readonly index: string;
	} = stageEvidenceRoute.useParams();

	return <EvidenceSourcePage identity={{ kind: "stage", ...params }} />;
}

const finalEvidenceRoute = createRoute({
	component: FinalEvidenceRoute,
	getParentRoute: () => rootRoute,
	path: "/runs/$run/final/evidence/$item/$index",
});

function FinalEvidenceRoute(): React.JSX.Element {
	const params: {
		readonly run: string;
		readonly item: string;
		readonly index: string;
	} = finalEvidenceRoute.useParams();

	return <EvidenceSourcePage identity={{ kind: "final", ...params }} />;
}

export { finalEvidenceRoute, stageEvidenceRoute };
