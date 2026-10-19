import { corpusVersionLabel } from "#benchmark/corpus-version-label";
import plural from "#client/plural";
import PageContent from "#client/system/components/page-content";
import ScreenHeader from "#client/system/components/screen-header";

import EditSection from "./corpus-editing-mode";
import CorpusInventory from "./corpus-inventory";
import type { CorpusFileNavigation, EditState } from "./corpus-navigation";
import type { CorpusResponse } from "./corpus-query";
import type {
	CorpusExperimentSource,
	SourceEvidence,
} from "./experiment-source";
import { ExperimentSource } from "./experiment-source";
import LastEditCard from "./last-edit-card";

interface CorpusScreenHeaderProps {
	readonly report: CorpusResponse | undefined;
}

function CorpusScreenHeader({
	report,
}: CorpusScreenHeaderProps): React.JSX.Element {
	return (
		<ScreenHeader
			title="Instruction corpus"
			subline={
				report === undefined ? undefined : (
					<>
						<span className="font-mono">{report.root}</span>
						{` · ${plural(report.files.length, "file")}`}
						{report.digest === undefined ? null : (
							<>
								{" · current version "}
								<span className="font-mono text-pale">
									{corpusVersionLabel(report.digest)}
								</span>
							</>
						)}
					</>
				)
			}
		/>
	);
}

interface CorpusWorkspaceProps {
	readonly report: CorpusResponse | undefined;
	readonly loading: boolean;
	readonly failed: boolean;
	readonly activeSource: CorpusExperimentSource | undefined;
	readonly sourcePath: string | undefined;
	readonly visibleEvidence: SourceEvidence | undefined;
	readonly operation: "editing" | "reading";
	readonly clearSource: () => void;
	readonly edit: EditState;
	readonly setEdit: (edit: EditState) => void;
	readonly navigation: CorpusFileNavigation;
}

function CorpusWorkspace({
	report,
	loading,
	failed,
	activeSource,
	sourcePath,
	visibleEvidence,
	operation,
	clearSource,
	edit,
	setEdit,
	navigation,
}: CorpusWorkspaceProps): React.JSX.Element {
	return (
		<PageContent>
			{report === undefined ? null : (
				<LastEditCard lastEdit={report.lastEdit} />
			)}
			{activeSource === undefined || sourcePath === undefined ? null : (
				<ExperimentSource
					source={activeSource}
					path={sourcePath}
					evidence={visibleEvidence}
					currentCorpus={report?.digest}
					operation={operation}
					onClear={clearSource}
				/>
			)}
			<EditSection
				edit={edit}
				onEdit={setEdit}
				source={activeSource}
				evidence={visibleEvidence}
				viewRequest={navigation.viewRequest}
				onCloseReader={navigation.onCloseReader}
			/>
			<CorpusInventory
				sourcePath={sourcePath}
				report={report}
				isLoading={loading}
				isError={failed}
				onEdit={navigation.onEdit}
				onView={navigation.onView}
			/>
		</PageContent>
	);
}

export { CorpusScreenHeader, CorpusWorkspace };
