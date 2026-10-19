import { useQuery } from "@tanstack/react-query";

import { launchSettingsQuery } from "#client/launch/settings-query";

import {
	CorpusDirectoryForm,
	CorpusLinkActions,
} from "./corpus-settings-controls";
import VersionLabel, { CorpusSettingsOutcome } from "./corpus-settings-reading";
import SettingsCard from "./settings-card";
import useCorpusSettings from "./use-corpus-settings";

function CorpusSettingsCard(): React.JSX.Element {
	const settings = useQuery(launchSettingsQuery);
	const { directory, setDirectory, outcome, writing, link, unlink, rehash } =
		useCorpusSettings();
	return (
		<SettingsCard title="Corpus">
			{settings.isError ? (
				<p role="alert" className="mt-2 text-12 text-attention">
					<span aria-hidden="true">⚠ </span>
					{`Could not read which corpus is linked: ${settings.error.message}`}
				</p>
			) : null}
			{settings.data === undefined ? null : (
				<div className="mt-2 flex min-w-0 flex-col gap-2 font-mono text-13 sm:flex-row sm:items-start sm:gap-3">
					<span className="min-w-0 flex-1 wrap-anywhere">
						{settings.data.linkedCorpus.root}
					</span>
					<VersionLabel root={settings.data.linkedCorpus.root} />
				</div>
			)}
			<CorpusLinkActions
				writing={writing}
				linked={settings.data?.linkedCorpus.kind === "directory"}
				onRehash={() => {
					rehash.mutate();
				}}
				onUnlink={() => {
					unlink.mutate();
				}}
			/>
			<CorpusDirectoryForm
				directory={directory}
				setDirectory={setDirectory}
				writing={writing}
				onLink={(value) => {
					link.mutate(value);
				}}
			/>
			<CorpusSettingsOutcome outcome={outcome} />
		</SettingsCard>
	);
}

export { CorpusSettingsCard as default };
