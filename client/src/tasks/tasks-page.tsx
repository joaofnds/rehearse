import { ScreenHeader } from "#client/system/components/screen-header";

export function TasksPage(): React.JSX.Element {
	return (
		<div>
			<ScreenHeader
				title="Tasks"
				subline="A task is a chain of steps against a base repository · declared as the pipeline file a case names, or chosen by a run"
			/>
		</div>
	);
}
