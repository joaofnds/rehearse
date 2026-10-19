import { useQuery } from "@tanstack/react-query";

import { launchSettingsQuery } from "#client/launch/settings-query";

import type { OpenedCorpusFile } from "./corpus-navigation";
import {
	useCorpusFileNavigation,
	useOpenedCorpusFile,
} from "./corpus-navigation";
import { corpusQuery } from "./corpus-query";
import { CorpusScreenHeader, CorpusWorkspace } from "./corpus-workspace";
import type { CorpusExperimentSource } from "./experiment-source";
import { useExperimentSource } from "./experiment-source";

interface CorpusPageProps {
	readonly opened?: OpenedCorpusFile | undefined;
	readonly source?: CorpusExperimentSource | undefined;
}

function CorpusPage({ opened, source }: CorpusPageProps): React.JSX.Element {
	const query = useQuery(corpusQuery);
	const settings = useQuery(launchSettingsQuery);
	const { edit, setEdit } = useOpenedCorpusFile(opened);
	const {
		activeSource,
		sourcePath,
		visibleEvidence,
		clearSource,
		selectedFile,
	} = useExperimentSource(
		opened?.path,
		source,
		edit.kind === "idle" ? undefined : edit.path,
	);
	const navigation = useCorpusFileNavigation({
		edit,
		editable: settings.data?.linkedCorpus.kind === "directory",
		selectedFile,
		setEdit,
	});

	return (
		<div>
			<CorpusScreenHeader report={query.data} />

			<CorpusWorkspace
				report={query.data}
				loading={query.isLoading}
				failed={query.isError}
				activeSource={activeSource}
				sourcePath={sourcePath}
				visibleEvidence={visibleEvidence}
				operation={
					settings.data?.linkedCorpus.kind === "directory" &&
					edit.kind === "editing"
						? "editing"
						: "reading"
				}
				clearSource={clearSource}
				edit={edit}
				setEdit={setEdit}
				navigation={navigation}
			/>
		</div>
	);
}

export type { OpenedCorpusFile } from "./corpus-navigation";
export { CorpusPage as default };
