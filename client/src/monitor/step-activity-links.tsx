import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { NO_KEPT_TRANSCRIPT } from "#client/run-detail/step-report";
import { Button } from "#client/system/ui/button";

import { stageJudgeQuery } from "./stage-judge-query";
import { stageSessionQuery } from "./stage-session-query";
import { SectionTitle } from "./step-inputs";
import { judgeLine } from "./step-record-readings";

/** Where the stage's transcript is kept, linked to its session page. */
interface SessionLinkProps {
	readonly run: string;
	readonly stage: string;
}

function SessionLink({
	run,
	stage,
}: SessionLinkProps): React.JSX.Element | null {
	const session = useQuery(stageSessionQuery(run, stage));
	if (session.isError) {
		return (
			<span className="self-center text-12 text-muted-foreground">
				Could not read this step's session.
			</span>
		);
	}
	if (session.data === undefined) {
		return null;
	}
	if (session.data.state !== "closed") {
		return null;
	}
	if (session.data.transcriptPath === undefined) {
		return (
			<span className="self-center text-12 text-muted-foreground">
				Transcript not recorded: {NO_KEPT_TRANSCRIPT}
			</span>
		);
	}

	return (
		<Link
			to="/runs/$run/stages/$stage"
			params={{ run, stage }}
			className="self-center text-14"
		>
			Open its transcript
		</Link>
	);
}

interface JudgeSummaryProps {
	readonly run: string;
	readonly stage: string;
}

function JudgeSummary({ run, stage }: JudgeSummaryProps): React.JSX.Element {
	const judge = useQuery(stageJudgeQuery(run, stage));

	return (
		<>
			<SectionTitle>Judge</SectionTitle>
			<p className="mt-1.75 text-12 text-pretty text-secondary-foreground">
				{judgeLine(judge.isError ? "unreadable" : judge.data)}
			</p>
			<div className="mt-2.25 flex flex-wrap gap-2">
				<Button asChild variant="outline" size="sm">
					<Link
						to="/runs/$run"
						params={{ run }}
						search={{ step: stage, view: "results" }}
					>
						Full step report
					</Link>
				</Button>
				<SessionLink run={run} stage={stage} />
			</div>
		</>
	);
}

export { JudgeSummary as default };
