import AmountInput from "#client/system/components/amount-input";

import { SetupStep, StepProse } from "./setup-step";

const LIMIT_PRESETS = ["5.00", "20.00", "50.00"] as const;

interface LimitPresetProps {
	readonly preset: string;
	readonly pressed: boolean;
	readonly onPress: () => void;
}

function LimitPreset({
	preset,
	pressed,
	onPress,
}: LimitPresetProps): React.JSX.Element {
	return (
		<button
			type="button"
			aria-pressed={pressed}
			onClick={onPress}
			className="min-h-touch-target min-w-touch-target rounded-md border border-strong px-2.5 py-1.5 font-mono text-14 text-secondary-foreground transition-colors hover:border-primary hover:bg-accent aria-pressed:border-primary aria-pressed:text-pale"
		>
			{`$${preset}`}
		</button>
	);
}

interface SpendLimitControlsProps {
	readonly limit: string;
	readonly onLimit: (limit: string) => void;
}

function SpendLimitControls({
	limit,
	onLimit,
}: SpendLimitControlsProps): React.JSX.Element {
	return (
		<div className="mt-3.5 flex flex-wrap items-center gap-2.5">
			<AmountInput
				value={limit}
				accessibleName="Spend limit in US dollars"
				onChange={onLimit}
			/>
			{LIMIT_PRESETS.map((preset) => (
				<LimitPreset
					key={preset}
					preset={preset}
					pressed={limit === preset}
					onPress={() => {
						onLimit(preset);
					}}
				/>
			))}
		</div>
	);
}

interface SetupLimitStepProps {
	readonly limitEntered: boolean;
	readonly limit: string;
	readonly setLimit: (limit: string) => void;
}

function SetupLimitStep({
	limitEntered,
	limit,
	setLimit,
}: SetupLimitStepProps): React.JSX.Element {
	return (
		<SetupStep
			number={1}
			title="Set a spend limit"
			state={limitEntered ? "Set" : "Required"}
			look="open"
		>
			<StepProse>
				Applies per run and per group. Rehearse refuses to start a run without
				one, and stops mid-step when the ceiling is reached.
			</StepProse>
			<SpendLimitControls limit={limit} onLimit={setLimit} />
		</SetupStep>
	);
}

export { SetupLimitStep as default };
