import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { runHistoryQuery } from "#client/run-history/run-history-query";
import { Button } from "#client/system/ui/button";

import { attemptPath } from "./attempt-record-identity";
import type { SiblingAttempt } from "./attempt-siblings";
import {
	FIRST_STAGE_POSITION,
	MISSING_SEQUENCE_INDEX,
	NEXT_SEQUENCE_ELEMENT_OFFSET,
	PREVIOUS_ELEMENT_OFFSET,
	attemptSiblings,
} from "./attempt-siblings";
import { AttemptBreadcrumb } from "./attempt-workspace-chrome";
import type { GroupAttemptIndex } from "./group-attempts-query";
import groupAttemptsQuery from "./group-attempts-query";
import type { SessionHistoryIdentity } from "./session-history-page";

interface AttemptNavigationProps {
	readonly identity: SessionHistoryIdentity;
	readonly view: "results" | "context";
	readonly step?: string | undefined;
	readonly comparison?: string | undefined;
}

function AttemptNavigation({
	identity,
	view,
	step,
	comparison,
}: AttemptNavigationProps): React.JSX.Element {
	const history = useQuery(runHistoryQuery);
	const group = useQuery({
		...groupAttemptsQuery(
			identity.kind === "confirmation" ? identity.groupId : "",
		),
		enabled: identity.kind === "confirmation",
	});
	const groupRecord = group.data;
	const siblings = attemptSiblings(identity, groupRecord, history.data?.rows);
	const { position, previous, next, caseId } = attemptPosition(
		identity,
		groupRecord,
		siblings,
	);
	const search = {
		view,
		...(step !== undefined && { step }),
		...(comparison !== undefined && { comparison }),
	};
	return (
		<div className="flex flex-wrap items-center justify-between gap-3 border-b border-divider page-gutter py-3 text-14">
			<AttemptBreadcrumb
				caseId={caseId}
				identity={identity}
				comparison={comparison}
				position={position}
				siblings={siblings}
				step={step}
			/>
			<AdjacentAttempts previous={previous} next={next} search={search} />
		</div>
	);
}

interface AdjacentAttemptsProps {
	readonly previous: SiblingAttempt | undefined;
	readonly next: SiblingAttempt | undefined;
	readonly search: AttemptSearch;
}

function AdjacentAttempts({
	previous,
	next,
	search,
}: AdjacentAttemptsProps): React.JSX.Element {
	return (
		<nav aria-label="Adjacent attempts" className="flex gap-2">
			{previous === undefined ? (
				<Button size="sm" variant="quiet" disabled>
					Previous attempt
				</Button>
			) : (
				<Button size="sm" variant="quiet" asChild>
					<Link to={previous.path} search={search}>
						Previous attempt
					</Link>
				</Button>
			)}
			{next === undefined ? (
				<Button size="sm" variant="quiet" disabled>
					Next attempt
				</Button>
			) : (
				<Button size="sm" variant="quiet" asChild>
					<Link to={next.path} search={search}>
						Next attempt
					</Link>
				</Button>
			)}
		</nav>
	);
}

interface AttemptSearch {
	readonly view: "results" | "context";
	readonly step?: string | undefined;
	readonly comparison?: string | undefined;
}

interface AttemptPosition {
	readonly position: number;
	readonly previous: SiblingAttempt | undefined;
	readonly next: SiblingAttempt | undefined;
	readonly caseId: string | undefined;
}

function attemptPosition(
	identity: SessionHistoryIdentity,
	groupRecord: GroupAttemptIndex | undefined,
	siblings: readonly SiblingAttempt[],
): AttemptPosition {
	const position = siblings.findIndex(
		(item) => item.path === attemptPath(identity),
	);
	const selected = siblings[position];
	const previous =
		position > FIRST_STAGE_POSITION
			? siblings[position - PREVIOUS_ELEMENT_OFFSET]
			: undefined;
	const next =
		position === MISSING_SEQUENCE_INDEX
			? undefined
			: siblings[position + NEXT_SEQUENCE_ELEMENT_OFFSET];
	const caseId =
		selected?.caseId ??
		(identity.kind === "standalone" ? identity.caseId : groupRecord?.caseId);
	return { caseId, next, position, previous };
}

export { AttemptNavigation as default };
