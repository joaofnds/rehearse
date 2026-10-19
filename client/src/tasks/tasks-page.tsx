import { useState } from "react";

import ActionGroup from "#client/system/components/action-group";
import ScreenHeader from "#client/system/components/screen-header";

import { ExportTaskDialog, ImportTaskDialog } from "./task-bundle-dialogs";
import useWorkflowListing from "./use-workflow-listing";
import WorkflowListingContent from "./workflow-listing";

/**
 * The tasks are read once, and a run started after that is on no card until
 * they are read again. They are re-read each time the polled history still
 * shows a run in flight that no card holds, so Open graph reaches it once its
 * manifest names its pipeline.
 */
interface TasksPageProps {
	readonly embedded?: boolean;
	readonly caseId?: string;
}

function TasksPage({
	embedded = false,
	caseId,
}: TasksPageProps): React.JSX.Element {
	const listing = useWorkflowListing(caseId);
	const [importedPath, setImportedPath] = useState<string>();

	return (
		<div>
			{embedded ? null : (
				<ScreenHeader
					title="Workflows"
					subline="Reusable step definitions for workflow cases"
					aside={
						<ActionGroup>
							<ImportTaskDialog onImported={setImportedPath} />
							<ExportTaskDialog tasks={listing.tasks} />
						</ActionGroup>
					}
				/>
			)}

			<WorkflowListingContent
				embedded={embedded}
				caseId={caseId}
				listing={listing}
				importedPath={importedPath}
				setImportedPath={setImportedPath}
			/>
		</div>
	);
}

export { TasksPage as default };
