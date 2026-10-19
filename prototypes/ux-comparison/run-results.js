import {
	button,
	checklistEvidence,
	escapeHtml,
	evidence,
	money,
	shell,
	tabs,
} from "./screen-components.js";
import { modal } from "./screen-inspector.js";
import data from "./selected-records.json" with { type: "json" };

const JSON_INDENT_SPACES = 2;

const FIRST_FINDING_EVIDENCE_INDEX = 0;

function runResults() {
	const { run } = data;
	const build = run.stages.find((item) => item.stage === "build");
	if (build === undefined) {
		throw new Error("Saved Build step missing");
	}

	for (const item of run.grade.requirements) {
		modal(`final-${item.id}`, `Final task Judge · ${item.id}`, evidence(item));
	}

	const findings = finalTaskFindings(run.grade);
	const selectedBuild = selectedBuildStep(build);

	modal(
		"run-record",
		"Run setup and original readings",
		`<pre>${escapeHtml(JSON.stringify({ judgeModel: run.judgeModel, minimumGrade: run.minimumGrade, model: run.model, run: run.id, stages: run.stages, totals: run.totals }, null, JSON_INDENT_SPACES))}</pre>`,
	);

	return shell(
		`<header class="top"><div><div class="breadcrumbs">Runs <span>/</span> audit-log <span>/</span> r44</div><h1>r44 <span class="secondary">audit-log</span></h1><div class="sub"><span class="badge">■ Execution ended</span><span>Human review pending</span><span>Oct 15, 14:10</span><span class="mono">sonnet · corpus@0a78c2</span></div></div><div class="top-meters"><div><strong>${money(run.totals.cost.usd)}</strong><span>whole run</span></div><div><strong>20:01</strong><span>elapsed</span></div></div></header>${tabs(["Results", "Activity", "Context & cost"], "Results")}<div class="body"><section class="panel outcome"><div><div class="title"><span class="badge danger">FAIL</span><h2>Final task result</h2></div><p>3 of 14 criteria failed in the independent task Judge.</p></div><div class="actions">${button("Inspect final evidence", "final-all", "primary")}</div></section><div class="step-strip"><div class="eyebrow">Workflow</div><div class="step"><span>01 · Shape <span class="muted small">✓ accepted</span></span><span class="grade">C</span></div><span class="muted">→</span><div class="step selected"><span>02 · Build <span class="small">✓ accepted</span></span><span class="grade">B</span></div>${button("Expand workflow", "run-record", "end quiet")}</div><div class="columns">${findings}<aside class="aside">${selectedBuild}<section class="panel padded"><h3>Human review</h3><p class="small" style="margin-top:8px">No human review recorded.</p></section></aside></div><div class="details-row"><details class="panel disclosure"><summary>Run setup & provenance</summary><p>Run r44 · sonnet · Judge opus · corpus@0a78c2 · minimum step grade F.</p>${button("Read original measurements", "run-record", "quiet")}</details><details class="panel disclosure"><summary>Earlier final result for this case</summary><p>r22 also failed, on corpus@e73e56. Its corpus differs; this is historical context, not a controlled comparison.</p></details></div></div>`,
	);
}
/**
 * @typedef {{readonly summary:string, readonly requirements:Parameters<typeof checklistEvidence>[0]["requirements"]}} FinalTaskAssessment
 * @param {FinalTaskAssessment} grade
 */
function finalTaskFindings(grade) {
	const failed = grade.requirements.filter((item) => item.status === "FAIL");
	const passed = grade.requirements.filter((item) => item.status === "PASS");
	/** @type {Record<string, string>} */
	const names = {
		"behavior-coverage": "Behavior coverage",
		entity: "Entity mapping and defaults",
		location: "Directory location",
	};

	modal(
		"final-all",
		"Final task Judge · recorded assessment",
		`<p>${escapeHtml(grade.summary)}</p>${grade.requirements.map((item) => `<h3>${escapeHtml(item.id)} · ${item.status}</h3>${evidence(item)}`).join("")}`,
	);

	return `<section class="panel"><header class="panel-head"><h2>Why the final work failed</h2><span class="small">Recorded task Judge findings</span></header><div class="findings">${failed.map((item) => `<article class="finding"><div class="row"><h3>${escapeHtml(names[item.id] ?? item.id)}</h3><span class="badge danger">FAIL</span></div><p>${escapeHtml(item.evidence[FIRST_FINDING_EVIDENCE_INDEX]?.claim ?? "No claim recorded")}</p><footer><code>${escapeHtml(item.evidence[FIRST_FINDING_EVIDENCE_INDEX]?.path ?? "No path recorded")}</code>${button("View citation ↗", `final-${item.id}`, "quiet")}</footer></article>`).join("")}</div><details class="disclosure"><summary>${passed.length} passed criteria · inspect the complete assessment</summary><p>${passed.map((item) => escapeHtml(item.id)).join(" · ")}</p></details></section>`;
}
/**
 * @typedef {{readonly sessionCost:{readonly usd:number},readonly judgeCost:{readonly usd:number}}} BuildSpend
 * @param {BuildSpend} build
 */
function selectedBuildStep(build) {
	const { run } = data;

	modal(
		"build-detail",
		"Build · recorded step assessment",
		`<p>${escapeHtml(run.buildAssessment.summary)}</p><p>${run.buildAssessment.dimensions.map((item) => `${escapeHtml(item.id)} ${item.grade}`).join(" · ")}</p>${checklistEvidence(run.buildAssessment)}`,
	);
	modal(
		"review-build",
		"Review this Judge · Build",
		"<p>The proposed Results keeps the contextual link to the existing blind grading form for this Build assessment. This standalone review starts no grading or submission.</p>",
	);
	modal(
		"build-io",
		"Build · inputs and output",
		'<p>Frozen input: <span class="mono">audit-log/r44/s1</span>. Produced checkpoint: <span class="mono">audit-log/r44/s2</span>.</p><p>9 commits, 22 files changed and 2 workflow-state changes were recorded. Full repository artifacts remain inspectable in the application.</p>',
	);
	modal(
		"replay-build",
		"Replay Build from its saved input",
		'<p>This proposal keeps the selected input <span class="mono">audit-log/r44/s1</span> and opens the existing launch preflight with the corpus and model conditions visible. This review page starts no execution.</p>',
	);
	modal(
		"edit-build",
		"Test an instruction · Build",
		'<p>The selected source stays <span class="mono">audit-log/r44 · build</span>, with input <span class="mono">r44/s1</span> and instruction <span class="mono">skills/build/SKILL.md</span>. Editing, review and apply would operate on an explicitly linked editable corpus. This page edits no files.</p>',
	);

	return `<section class="panel padded"><h2>Selected step · Build</h2><div class="acceptance"><strong>B</strong><span class="badge">✓ accepted · min F</span></div><p class="small">Step acceptance and final task outcome are graded independently.</p><div class="stat-row"><span class="secondary">Step total</span><span class="mono">${money(build.sessionCost.usd + build.judgeCost.usd)}</span></div><div class="stat-row"><span class="secondary">Execution / Judge</span><span class="mono small">${money(build.sessionCost.usd)} / ${money(build.judgeCost.usd)}</span></div><div class="stat-row"><span class="secondary">Elapsed</span><span class="mono">12:18</span></div><div class="buttons">${button("Inspect Build details", "build-detail")}${button("Inputs & output", "build-io")}${button("Review this Judge", "review-build")}${button("Replay Build", "replay-build")}${button("Test an instruction", "edit-build")}</div><p class="foot">1 saved attempt at this input. No rerun comparison yet.</p></section>`;
}
export { runResults as default };
