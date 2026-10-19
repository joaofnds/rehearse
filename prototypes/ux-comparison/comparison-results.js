import { button, money, shell } from "./screen-components.js";
import { modal } from "./screen-inspector.js";
import data from "./selected-records.json" with { type: "json" };

const ORDINAL_BASE = 1;
const PREFIX_START_INDEX = 0;
const DIGEST_PREVIEW_CHARACTERS = 6;

function comparison() {
	const { comparison: comparisonData } = data;
	const caseId = "triage-inbox-cut";

	modal(
		"comparison-attempts",
		"18 saved attempts · recorded checks",
		`<p>Each arm has six attempts. Per-attempt blocker grading was not recorded.</p><table><thead><tr><th>Attempt</th><th>Baseline words</th><th>Candidate words</th><th>Control words</th></tr></thead><tbody>${comparisonData.attempts[caseId].baseline.map((item, index) => `<tr><td>${index + ORDINAL_BASE} · all checks pass</td><td>${item.words.words}</td><td>${comparisonData.attempts[caseId].candidate[index]?.words.words ?? "Unavailable"}</td><td>${comparisonData.attempts[caseId].control[index]?.words.words ?? "Unavailable"}</td></tr>`).join("")}</tbody></table>`,
	);
	modal(
		"attribution",
		"Two files differ between baseline and candidate",
		"<p>Movement cannot be attributed to one file, because both files changed:</p><pre>skills/triage/SKILL.md\nskills/triage/references/inbox.md</pre><p>The control is a minimal corpus supplied by the comparison's author. The saved report does not record how it was constructed.</p>",
	);
	modal(
		"control-readings",
		"All contrasts · including control",
		`<p>Recorded check outcomes: all arms 6/6 passed; each arm has a 61–100% interval. The reading is unchanged, already clear; it does not establish equal overall quality.</p><table><thead><tr><th>Contrast</th><th>Cost per attempt</th><th>Reply length</th></tr></thead><tbody><tr><td>Candidate − baseline</td><td>+6% · inside rerun noise</td><td>+4% · inside rerun noise</td></tr><tr><td>Candidate − control</td><td>+493% · higher</td><td>+26% · inside rerun noise</td></tr><tr><td>Baseline − control</td><td>+460% · higher</td><td>+21% · inside rerun noise</td></tr></tbody></table><p>All contrasts refuse single-file attribution. The supplied control's construction was not recorded.</p>`,
	);
	modal(
		"comparison-method",
		"Interpretation and collection limits",
		"<p>Six attempts per arm. Rehearse does not compute the smallest shift those attempts could detect. A reading inside rerun noise does not establish that the edit changed nothing.</p><p>Equal passing checks do not establish equal overall quality. All failures and ungraded attempts must remain visible in other records.</p><p>This report was not created by compare attempts; its saved records do not identify the checkpoint and corpora needed for adding attempts.</p>",
	);
	const armCards = comparisonArmCards();

	return shell(
		`<header class="top"><div><div class="breadcrumbs">Comparisons <span>/</span> triage-inbox-cut</div><h1>Triage instruction edit</h1><div class="sub"><span>Session case</span><span>6 attempts per arm · 18 total</span><span>2 changed files</span></div></div><div class="top-meters"><div><strong>$14.70</strong><span>recorded total</span></div></div></header><div class="body"><section class="panel comparison-summary"><div><h2>No change in recorded check outcomes</h2><p>All three arms passed 6 of 6 attempts. Against baseline, candidate cost and reply-length changes are inside rerun noise; equal passing checks do not establish equal overall quality. Both edited corpora cost more than the supplied control.</p></div>${button("Inspect attempts", "comparison-attempts", "primary")}</section>${armCards}<section class="panel"><header class="panel-head"><h2>What moved · candidate against baseline</h2><div>${button("All contrasts & control", "control-readings", "quiet")} · ${button("Measurement method", "comparison-method", "quiet")}</div></header><table><thead><tr><th class="table-measure">Measure</th><th>Baseline</th><th>Candidate</th><th>Reading</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${row.label}<small>${row.range}</small></td><td class="mono">${row.before}</td><td class="mono">${row.after}</td><td>${row.delta}</td></tr>`).join("")}</tbody></table></section><section class="panel attribution"><div><h3>Two files changed; single-file attribution is refused</h3><p class="mono small">skills/triage/SKILL.md · skills/triage/references/inbox.md</p></div>${button("Inspect corpus difference", "attribution")}</section><div class="notice"><strong>6 attempts per arm.</strong> The smallest detectable shift is not computed. Blocker grading was not recorded for these attempts. ${button("Read limitations", "comparison-method", "quiet")}</div><details class="panel disclosure"><summary>All attempts, control construction and extension availability</summary><p>Control: supplied minimal corpus; its construction was not recorded. More attempts cannot be added from this saved report.</p>${button("All 18 attempts", "comparison-attempts", "quiet")}</details></div>`,
		"Comparisons",
	);
}
function comparisonArmCards() {
	const { comparison: comparisonData } = data;
	const caseId = "triage-inbox-cut";
	const figures = comparisonData.armFigures[caseId];
	const versions = comparisonData.corpusVersions[caseId];
	/** @type {readonly ["baseline", "candidate", "control"]} */
	const arms = ["baseline", "candidate", "control"];
	const labels = {
		baseline: "Baseline",
		candidate: "Candidate",
		control: "Control",
	};
	/** @type {Record<string, string>} */
	const descriptions = {
		baseline: "· before",
		candidate: "· after",
		control: "· supplied minimal corpus",
	};

	return `<div class="arm-cards">${arms.map((arm) => `<section class="panel arm ${arm === "candidate" ? "selected" : ""}"><div class="role"><h3>${labels[arm]} <span class="muted small">${descriptions[arm]}</span></h3><span class="mono small secondary">${versions[arm].digest.slice(PREFIX_START_INDEX, DIGEST_PREVIEW_CHARACTERS)}</span></div><span class="ratio">6/6</span><span class="checks">checks passed</span><div class="cost">${money(figures[arm].cost.perAttemptUsd)} <span class="small secondary">per attempt</span></div><p class="sub">${money(figures[arm].cost.totalUsd)} total · avg ${Math.round(figures[arm].words.averageWords)} words</p></section>`).join("")}</div>`;
}
const rows = [
	{
		after: "6/6 passed",
		before: "6/6 passed",
		delta: "Unchanged, already clear · each arm 61–100% interval",
		label: "Recorded checks",
		range: "Both arms · observed 6 of 6",
	},
	{
		after: "201 words",
		before: "192 words",
		delta: "+4% · inside rerun noise",
		label: "Reply length",
		range: "Baseline 138–247 · candidate 125–258",
	},
	{
		after: "$1.16",
		before: "$1.10",
		delta: "+6% · inside rerun noise",
		label: "Cost per attempt",
		range: "Baseline $0.31–$1.74 · candidate $0.42–$1.59",
	},
];

export { comparison as default };
