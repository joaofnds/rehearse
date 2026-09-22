import { CorpusPill } from "./components/corpus-pill";
import { EmptyState } from "./components/empty-state";
import { Disclosure } from "./components/disclosure";
import { FilterPill } from "./components/filter-pill";
import { GRADE_SIZES, Grade } from "./components/grade";
import { PlannedFeatureBlock } from "./components/planned-feature-block";
import { SectionLabel } from "./components/section-label";
import { Switcher } from "./components/switcher";
import { STATUS_STATES, Status } from "./components/status";
import { TableShell } from "./components/table-shell";
import {
	COLOR_TOKENS,
	FONT_SIZE_TOKENS,
	LETTER_SPACING_TOKENS,
	RADIUS_TOKENS,
	SPACE_TOKENS,
} from "./token-names";

const DEFERRED_COMPONENTS = [
	{ name: "Step node card", neededBy: "ACT-51 (live monitor)" },
	{ name: "Stat card", neededBy: "run detail (unfiled)" },
	{
		name: "Dialog shell",
		neededBy: "ACT-51 (step modal, its node action stack)",
	},
] as const;

const SAMPLE_LIST_CLASSES = "flex flex-wrap gap-5";

const TOKEN_NAME_CLASSES = "font-mono text-xs text-muted-foreground";

function noop(): void {
	return undefined;
}

export function SystemPage(): React.JSX.Element {
	return (
		<div>
			<header className="border-b border-divider px-6 pt-4 pb-3.5">
				<h1 className="text-xl font-medium tracking-tight">
					Rehearse design system
				</h1>
			</header>

			<div className="flex flex-col gap-9 px-6 pt-5 pb-12">
				<section className="flex flex-col gap-3">
					<SectionLabel>COLOR</SectionLabel>
					<ul className={SAMPLE_LIST_CLASSES}>
						{COLOR_TOKENS.map((token) => (
							<li key={token} className="flex flex-col items-center gap-1.5">
								<span
									className="block size-17 rounded-md border bg-(--preview-color)"
									style={{ "--preview-color": `var(${token})` }}
								/>
								<code className={TOKEN_NAME_CLASSES}>{token}</code>
							</li>
						))}
					</ul>
				</section>

				<section className="flex flex-col gap-3">
					<SectionLabel>TYPE SCALE</SectionLabel>
					<ul>
						{FONT_SIZE_TOKENS.map((token) => (
							<li
								key={token}
								className="text-(length:--preview-font-size)"
								style={{ "--preview-font-size": `var(${token})` }}
							>
								{token} — the quick brown fox
							</li>
						))}
					</ul>
				</section>

				<section className="flex flex-col gap-3">
					<SectionLabel>SPACE</SectionLabel>
					<ul className={SAMPLE_LIST_CLASSES}>
						{SPACE_TOKENS.map((token) => (
							<li key={token} className="flex flex-col items-start gap-1.5">
								<span
									className="block size-(--preview-size) bg-primary"
									style={{ "--preview-size": `var(${token})` }}
								/>
								<code className={TOKEN_NAME_CLASSES}>{token}</code>
							</li>
						))}
					</ul>
				</section>

				<section className="flex flex-col gap-3">
					<SectionLabel>RADIUS</SectionLabel>
					<ul className={SAMPLE_LIST_CLASSES}>
						{RADIUS_TOKENS.map((token) => (
							<li key={token} className="flex flex-col items-start gap-1.5">
								<span
									className="block size-11 rounded-(--preview-radius) bg-primary"
									style={{ "--preview-radius": `var(${token})` }}
								/>
								<code className={TOKEN_NAME_CLASSES}>{token}</code>
							</li>
						))}
					</ul>
				</section>

				<section className="flex flex-col gap-3">
					<SectionLabel>LETTER SPACING</SectionLabel>
					<ul>
						{LETTER_SPACING_TOKENS.map((token) => (
							<li
								key={token}
								className="tracking-(--preview-tracking)"
								style={{ "--preview-tracking": `var(${token})` }}
							>
								{token} — the quick brown fox
							</li>
						))}
					</ul>
				</section>

				<section className="flex flex-col gap-3">
					<SectionLabel>BORDER</SectionLabel>
					<ul className={SAMPLE_LIST_CLASSES}>
						<li className="flex flex-col items-start gap-1.5">
							<span className="block size-17 rounded-md border" />
							<code className={TOKEN_NAME_CLASSES}>
								--border-width-hairline
							</code>
						</li>
						<li className="flex flex-col items-start gap-1.5">
							<span className="block size-17 rounded-md border-l-2 border-l-deeper" />
							<code className={TOKEN_NAME_CLASSES}>
								--border-width-evidence
							</code>
						</li>
						<li className="flex flex-col items-start gap-1.5">
							<span className="block size-17 rounded-md border border-dashed border-deeper opacity-60" />
							<code className={TOKEN_NAME_CLASSES}>
								--border-style-planned / --opacity-planned
							</code>
						</li>
					</ul>
				</section>

				<section className="flex flex-col gap-3">
					<SectionLabel>SHADOW</SectionLabel>
					<span className="block size-17 rounded-xl bg-card shadow-(--shadow-dialog)" />
					<code className={TOKEN_NAME_CLASSES}>--shadow-dialog</code>
				</section>

				<section className="flex flex-col gap-3">
					<SectionLabel>SCROLLBAR</SectionLabel>
					<p>
						<code>--scrollbar-size</code>, <code>--scrollbar-thumb</code>,{" "}
						<code>--scrollbar-thumb-border</code> style every scrollbar on this
						page; scroll this page's overflow to see them.
					</p>
				</section>

				<section className="flex flex-col gap-3">
					<SectionLabel>STATUS</SectionLabel>
					<ul className={SAMPLE_LIST_CLASSES}>
						{STATUS_STATES.map((state) => (
							<li key={state}>
								<Status state={state} />
							</li>
						))}
					</ul>
				</section>

				<section className="flex flex-col gap-3">
					<SectionLabel>GRADE</SectionLabel>
					<ul className={SAMPLE_LIST_CLASSES}>
						{GRADE_SIZES.map((size) => (
							<li key={size} className="flex flex-col items-start gap-1.5">
								<Grade value={{ letter: "A−" }} size={size} />
								<code className={TOKEN_NAME_CLASSES}>{size}</code>
							</li>
						))}
						<li className="flex flex-col items-start gap-1.5">
							<Grade value={{ pending: true }} size="node" />
							<code className={TOKEN_NAME_CLASSES}>pending</code>
						</li>
					</ul>
				</section>

				<section className="flex flex-col gap-3">
					<SectionLabel>CORPUS PILL</SectionLabel>
					<div>
						<CorpusPill hash="a41c7e" />
					</div>
				</section>

				<section className="flex flex-col gap-3">
					<SectionLabel>FILTER PILL</SectionLabel>
					<div className="flex gap-2">
						<FilterPill pressed={false} onPress={noop}>
							All 148
						</FilterPill>
						<FilterPill pressed={true} onPress={noop}>
							Running
						</FilterPill>
					</div>
				</section>

				<section className="flex flex-col gap-3">
					<SectionLabel>DISCLOSURE</SectionLabel>
					<Disclosure collapsedLabel="2 cited" expandedLabel="hide evidence">
						<p>CLAUDE.md changed</p>
						<p>agents/advisor.md added</p>
					</Disclosure>
				</section>

				<section className="flex flex-col gap-3">
					<SectionLabel>SWITCHER</SectionLabel>
					<div>
						<Switcher
							label="Example switcher"
							options={["Attempt pairs", "What moved"]}
							selected="Attempt pairs"
							onSelect={noop}
						/>
					</div>
				</section>

				<section className="flex flex-col gap-3">
					<SectionLabel>TABLE SHELL</SectionLabel>
					<TableShell
						caption="DURABLE RECORDS"
						columns={["Run", "Case"]}
						rows={[["r-0148", "auth-refactor"]]}
					/>
				</section>

				<section className="flex flex-col gap-3">
					<SectionLabel>PLANNED FEATURE BLOCK</SectionLabel>
					<PlannedFeatureBlock heading="Edit an instruction, review, then apply">
						<p>Writes a new corpus version, keeps the old one addressable</p>
					</PlannedFeatureBlock>
				</section>

				<section className="flex flex-col gap-3">
					<SectionLabel>EMPTY STATE</SectionLabel>
					<EmptyState heading="No runs recorded">
						<p>
							The corpus is linked and a spend limit is set. Declare a case,
							then run it. Every attempt lands here as a durable record.
						</p>
					</EmptyState>
				</section>

				<section className="flex flex-col gap-3">
					<SectionLabel>NOT YET BUILT</SectionLabel>
					<ul className="list-disc pl-5 text-muted-foreground">
						{DEFERRED_COMPONENTS.map((component) => (
							<li key={component.name}>
								{component.name} — needed first by {component.neededBy}
							</li>
						))}
					</ul>
				</section>
			</div>
		</div>
	);
}
