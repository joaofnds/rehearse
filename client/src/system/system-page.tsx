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
import "./system-page.css";

const DEFERRED_COMPONENTS = [
	{ name: "Step node card", neededBy: "ACT-51 (live monitor)" },
	{ name: "Stat card", neededBy: "run detail (unfiled)" },
	{
		name: "Dialog shell",
		neededBy: "ACT-51 (step modal, its node action stack)",
	},
] as const;

function noop(): void {
	return undefined;
}

export function SystemPage(): React.JSX.Element {
	return (
		<div className="rh-system-page">
			<h1>Rehearse design system</h1>

			<section>
				<SectionLabel>COLOR</SectionLabel>
				<ul className="rh-system-page__swatches">
					{COLOR_TOKENS.map((token) => (
						<li key={token} className="rh-system-page__swatch">
							<span
								className="rh-system-page__swatch-color"
								style={{ "--rh-preview-color": `var(${token})` }}
							/>
							<code>{token}</code>
						</li>
					))}
				</ul>
			</section>

			<section>
				<SectionLabel>TYPE SCALE</SectionLabel>
				<ul className="rh-system-page__type-scale">
					{FONT_SIZE_TOKENS.map((token) => (
						<li
							key={token}
							className="rh-system-page__type-sample"
							style={{ "--rh-preview-font-size": `var(${token})` }}
						>
							{token} — the quick brown fox
						</li>
					))}
				</ul>
			</section>

			<section>
				<SectionLabel>SPACE</SectionLabel>
				<ul className="rh-system-page__space-scale">
					{SPACE_TOKENS.map((token) => (
						<li key={token}>
							<span
								className="rh-system-page__space-block"
								style={{ "--rh-preview-size": `var(${token})` }}
							/>
							<code>{token}</code>
						</li>
					))}
				</ul>
			</section>

			<section>
				<SectionLabel>RADIUS</SectionLabel>
				<ul className="rh-system-page__radius-scale">
					{RADIUS_TOKENS.map((token) => (
						<li key={token}>
							<span
								className="rh-system-page__radius-block"
								style={{ "--rh-preview-radius": `var(${token})` }}
							/>
							<code>{token}</code>
						</li>
					))}
				</ul>
			</section>

			<section>
				<SectionLabel>LETTER SPACING</SectionLabel>
				<ul className="rh-system-page__type-scale">
					{LETTER_SPACING_TOKENS.map((token) => (
						<li
							key={token}
							className="rh-system-page__tracking-sample"
							style={{ "--rh-preview-tracking": `var(${token})` }}
						>
							{token} — the quick brown fox
						</li>
					))}
				</ul>
			</section>

			<section>
				<SectionLabel>BORDER</SectionLabel>
				<ul className="rh-system-page__border-list">
					<li>
						<span className="rh-system-page__border-swatch rh-system-page__border-swatch--hairline" />
						<code>--border-width-hairline</code>
					</li>
					<li>
						<span className="rh-system-page__border-swatch rh-system-page__border-swatch--evidence" />
						<code>--border-width-evidence</code>
					</li>
					<li>
						<span className="rh-system-page__border-swatch rh-system-page__border-swatch--planned" />
						<code>--border-style-planned / --opacity-planned</code>
					</li>
				</ul>
			</section>

			<section>
				<SectionLabel>SHADOW</SectionLabel>
				<span className="rh-system-page__shadow-swatch" />
				<code>--shadow-dialog</code>
			</section>

			<section>
				<SectionLabel>SCROLLBAR</SectionLabel>
				<p>
					<code>--scrollbar-size</code>, <code>--scrollbar-thumb</code>,{" "}
					<code>--scrollbar-thumb-border</code> style every scrollbar on this
					page; scroll this page's overflow to see them.
				</p>
			</section>

			<section>
				<SectionLabel>STATUS</SectionLabel>
				<ul className="rh-system-page__status-list">
					{STATUS_STATES.map((state) => (
						<li key={state}>
							<Status state={state} />
						</li>
					))}
				</ul>
			</section>

			<section>
				<SectionLabel>GRADE</SectionLabel>
				<ul className="rh-system-page__grade-list">
					{GRADE_SIZES.map((size) => (
						<li key={size}>
							<Grade value={{ letter: "A−" }} size={size} />
							<code>{size}px</code>
						</li>
					))}
					<li>
						<Grade value={{ pending: true }} size="19" />
						<code>pending</code>
					</li>
				</ul>
			</section>

			<section>
				<SectionLabel>CORPUS PILL</SectionLabel>
				<CorpusPill hash="a41c7e" />
			</section>

			<section>
				<SectionLabel>FILTER PILL</SectionLabel>
				<FilterPill pressed={false} onPress={noop}>
					All 148
				</FilterPill>
				<FilterPill pressed={true} onPress={noop}>
					Running
				</FilterPill>
			</section>

			<section>
				<SectionLabel>DISCLOSURE</SectionLabel>
				<Disclosure collapsedLabel="2 cited" expandedLabel="hide evidence">
					<p>CLAUDE.md changed</p>
					<p>agents/advisor.md added</p>
				</Disclosure>
			</section>

			<section>
				<SectionLabel>SWITCHER</SectionLabel>
				<Switcher
					label="Example switcher"
					options={["Attempt pairs", "What moved"]}
					selected="Attempt pairs"
					onSelect={noop}
				/>
			</section>

			<section>
				<SectionLabel>TABLE SHELL</SectionLabel>
				<TableShell
					caption="DURABLE RECORDS"
					columns={["Run", "Case"]}
					rows={[["r-0148", "auth-refactor"]]}
				/>
			</section>

			<section>
				<SectionLabel>PLANNED FEATURE BLOCK</SectionLabel>
				<PlannedFeatureBlock heading="Edit an instruction, review, then apply">
					<p>Writes a new corpus version, keeps the old one addressable</p>
				</PlannedFeatureBlock>
			</section>

			<section>
				<SectionLabel>EMPTY STATE</SectionLabel>
				<EmptyState heading="No runs recorded">
					<p>
						The corpus is linked and a spend limit is set. Declare a case, then
						run it. Every attempt lands here as a durable record.
					</p>
				</EmptyState>
			</section>

			<section>
				<SectionLabel>NOT YET BUILT</SectionLabel>
				<ul>
					{DEFERRED_COMPONENTS.map((component) => (
						<li key={component.name}>
							{component.name} — needed first by {component.neededBy}
						</li>
					))}
				</ul>
			</section>
		</div>
	);
}
