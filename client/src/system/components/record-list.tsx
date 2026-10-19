import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";
import { useId } from "react";

interface RecordListProps {
	readonly label: string;
	readonly children: ReactNode;
}

function RecordList({ label, children }: RecordListProps): React.JSX.Element {
	return (
		<ul
			aria-label={label}
			className="min-w-0 divide-y divide-divider rounded-lg border border-divider bg-card"
		>
			{children}
		</ul>
	);
}

interface RecordListItemProps {
	readonly title: ReactNode;
	readonly meta: ReactNode;
	readonly children: ReactNode;
	readonly action: ReactNode;
	readonly details: ReactNode;
}

function RecordListItem({
	title,
	meta,
	children,
	action,
	details,
}: RecordListItemProps): React.JSX.Element {
	const titleId = useId();
	const metaId = useId();

	return (
		<li aria-labelledby={`${titleId} ${metaId}`} className="min-w-0">
			<div className="grid min-w-0 gap-5 px-6 pt-6 pb-2 sm:grid-cols-2 lg:grid-cols-12 lg:items-start">
				<RecordIdentityHeading
					title={title}
					meta={meta}
					titleId={titleId}
					metaId={metaId}
				/>
				<div className="min-w-0 sm:col-span-2 sm:row-start-2 lg:col-span-5 lg:col-start-5 lg:row-start-1">
					{children}
				</div>
				<div className="min-w-0 justify-self-start sm:col-start-2 sm:row-start-1 sm:justify-self-end lg:col-span-3 lg:col-start-10">
					{action}
				</div>
			</div>
			<RecordProvenance details={details} />
		</li>
	);
}

interface RecordIdentityHeadingProps {
	readonly title: ReactNode;
	readonly meta: ReactNode;
	readonly titleId: string;
	readonly metaId: string;
}

function RecordIdentityHeading({
	title,
	meta,
	titleId,
	metaId,
}: RecordIdentityHeadingProps): React.JSX.Element {
	return (
		<header className="flex min-w-0 flex-col gap-3 sm:row-start-1 lg:col-span-4">
			<h2 id={titleId} className="text-16 font-semibold wrap-anywhere">
				{title}
			</h2>
			<div
				id={metaId}
				className="flex flex-wrap items-center gap-x-3 gap-y-2 text-12 text-muted-foreground"
			>
				{meta}
			</div>
		</header>
	);
}

interface RecordProvenanceProps {
	readonly details: ReactNode;
}

function RecordProvenance({
	details,
}: RecordProvenanceProps): React.JSX.Element {
	return (
		<details className="group min-w-0">
			<summary className="flex min-h-touch-target cursor-pointer list-none items-center gap-2 px-6 py-2 text-12 text-muted-foreground hover:bg-row-hover hover:text-foreground">
				<ChevronRight
					aria-hidden="true"
					className="size-4 shrink-0 group-open:rotate-90"
				/>
				Setup &amp; record
			</summary>
			<div className="min-w-0 border-t border-divider p-6 text-14 wrap-anywhere">
				{details}
			</div>
		</details>
	);
}

export { RecordList, RecordListItem };
