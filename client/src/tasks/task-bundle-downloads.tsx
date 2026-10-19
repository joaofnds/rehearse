import ActionGroup from "#client/system/components/action-group";
import { Button } from "#client/system/ui/button";

import type { PipelinesResponse } from "./pipelines-query";
import { bundleUrl } from "./task-bundle-api";

type ListedTask = PipelinesResponse["pipelines"][number];

interface BundleDownloadsProps {
	readonly declared: readonly {
		readonly caseId: string;
		readonly task: ListedTask;
	}[];
}

function BundleDownloads({
	declared,
}: BundleDownloadsProps): React.JSX.Element {
	return (
		<ul className="flex flex-col gap-2">
			{declared.map(({ task, caseId }) => (
				<li
					key={caseId}
					className="flex min-w-0 flex-col items-start gap-3 rounded-md border border-strong px-3 py-3 sm:flex-row sm:items-center"
				>
					<div className="flex min-w-0 flex-1 flex-col gap-1 wrap-anywhere">
						<span className="text-14 font-medium">{caseId}</span>
						<span className="text-12 text-dim">
							{task.stages.join(" → ")} · {task.stageJudges} step judges +{" "}
							{task.taskJudges} final judge
						</span>
						<span className="font-mono text-12 text-dim">
							{caseId}.task.json
						</span>
					</div>
					<ActionGroup className="sm:ml-auto">
						<Button variant="outline" size="sm" asChild>
							<a
								aria-label={`Download ${caseId}.task.json`}
								href={bundleUrl(caseId)}
								download={`${caseId}.task.json`}
							>
								Download
							</a>
						</Button>
					</ActionGroup>
				</li>
			))}
		</ul>
	);
}

export { BundleDownloads as default };
export type { ListedTask };
