import { SetupCaseStep, SetupFinishActions } from "./setup-completion";
import { SetupCorpusStep } from "./setup-corpus";
import SetupLimitStep from "./setup-limit";
import useSetupProgress from "./use-setup-progress";

function SetupPage(): React.JSX.Element {
	const model = useSetupProgress();
	return (
		<div className="flex min-w-0 justify-center page-gutter py-8 sm:py-17">
			<div className="min-w-0 w-full max-w-191">
				<h1 className="text-24 tracking-tight leading-heading">
					Nothing is measured yet
				</h1>
				<SetupIntroduction />

				<ol aria-label="Setup steps" className="mt-8.5 flex flex-col gap-3.5">
					<SetupLimitStep
						limitEntered={model.limitEntered}
						limit={model.limit}
						setLimit={model.setLimit}
					/>
					<SetupCorpusStep
						linked={model.linked}
						limitEntered={model.limitEntered}
						livePlaceholder={model.livePlaceholder}
						directory={model.directory}
						setDirectory={model.setDirectory}
						onScan={model.onScan}
						scanning={model.scanning}
						refusal={model.scanFailure}
						scanned={model.scanned}
					/>
					<SetupCaseStep
						linked={model.linked}
						declaredPath={model.declaredPath}
						setDeclaredPath={model.setDeclaredPath}
					/>
				</ol>

				<SetupFinishActions
					limitEntered={model.limitEntered}
					linked={model.linked}
					pending={model.pending}
					usd={model.usd}
					onFinish={model.onFinish}
				/>
				<SetupFailures
					finishFailure={model.finishFailure}
					settingsFailure={model.settingsFailure}
				/>
			</div>
		</div>
	);
}

interface SetupFailuresProps {
	readonly finishFailure: string | undefined;
	readonly settingsFailure: string | undefined;
}

function SetupFailures({
	finishFailure,
	settingsFailure,
}: SetupFailuresProps): React.JSX.Element {
	return (
		<>
			{finishFailure === undefined ? null : (
				<p role="alert" className="mt-2 text-12 text-attention wrap-anywhere">
					<span aria-hidden="true">⚠ </span>
					{`The spend limit was not stored: ${finishFailure}`}
				</p>
			)}
			{settingsFailure === undefined ? null : (
				<p role="alert" className="mt-2 text-12 text-attention wrap-anywhere">
					<span aria-hidden="true">⚠ </span>
					{`Could not read the stored settings: ${settingsFailure}`}
				</p>
			)}
		</>
	);
}

function SetupIntroduction(): React.JSX.Element {
	return (
		<p className="mt-2.5 max-w-intro text-muted-foreground">
			Scan an instruction corpus to unlock case declaration. Choose a spend
			limit before starting runs. Finish setup stores that limit once the corpus
			is linked.
		</p>
	);
}

export { SetupPage as default };
