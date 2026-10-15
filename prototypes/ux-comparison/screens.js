import data from "./selected-records.json" with { type: "json" };
import { required } from "./dom.js";

const screen = new URLSearchParams(location.search).get("screen") ?? "results";
const app = required("#app", HTMLElement);
const inspector = required("#inspector", HTMLDialogElement);
/** @type {Map<string, {title: string, content: string}>} */
const modals = new Map();
/** @param {string} value */
const escapeHtml = (value) =>
	value.replaceAll(
		/[&<>"']/gu,
		(letter) =>
			({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
				letter
			] ?? letter,
	);
/** @param {number} value */
const money = (value) => `$${value.toFixed(2)}`;
/** @param {number} value */
const count = (value) => value.toLocaleString("en-US");
/** @param {number} milliseconds */
const clock = (milliseconds) =>
	`${String(Math.floor(milliseconds / 60_000)).padStart(2, "0")}:${String(Math.floor(milliseconds / 1000) % 60).padStart(2, "0")}`;
/** @param {'Runs'|'Comparisons'|'Cases'|'Corpus'|'Settings'} name */
const icon = (name) => {
	const paths = {
		Runs: "M3 5h2m3 0h13M3 12h2m3 0h13M3 19h2m3 0h13",
		Comparisons:
			"M6 3v10a5 5 0 0 0 5 5h7M3 6l3-3 3 3m6 9 3 3-3 3M18 3v5a4 4 0 0 1-4 4H6",
		Cases: "m12 3 9 5v8l-9 5-9-5V8l9-5Zm0 9 9-4M12 12 3 8m9 4v9",
		Corpus: "M7 3h12v17H7M7 6H3v15h13M10 7h6m-6 4h6m-6 4h6",
		Settings: "M3 6h18M3 12h18M3 18h18M8 3v6m8 0v6m-7 0v6",
	};
	return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
};

/** @param {string} key @param {string} title @param {string} content */
function modal(key, title, content) {
	modals.set(key, { title, content });
	return key;
}

/** @param {string} label @param {string} key @param {string} classes */
function button(label, key, classes = "") {
	return `<button class="${classes}" data-inspect="${escapeHtml(key)}">${label}</button>`;
}

/** @param {string} content @param {string} active */
function shell(content, active = "Runs") {
	/** @type {('Runs'|'Comparisons'|'Cases'|'Corpus'|'Settings')[]} */
	const items = ["Runs", "Comparisons", "Cases", "Corpus", "Settings"];
	const counts = {
		Runs: "190",
		Comparisons: "5",
		Corpus: "137",
		Cases: "",
		Settings: "",
	};
	return `<div class="app"><aside class="sidebar"><div class="brand">Rehearse</div><section class="corpus"><div class="eyebrow">Corpus under test</div><p><span class="mono">corpus@0a78c2</span> <span class="muted">137 files</span></p><p class="muted">last edit 14 Oct 2026 · 00:55</p></section><nav aria-label="Sections">${items.map((name) => `<a class="nav-item ${name === active ? "active" : ""}" href="index.html?screen=${name === "Comparisons" ? "comparison" : "results"}">${icon(name)}${name}<span>${counts[name]}</span></a>`).join("")}</nav></aside><main class="main">${content}</main></div>`;
}

/** @param {readonly string[]} names @param {string} active */
function tabs(names, active) {
	return `<nav class="tabs" aria-label="Evidence views">${names.map((name) => `<button class="${name === active ? "active" : ""}" data-inspect="view-guidance">${name}</button>`).join("")}<span class="end">Saved evidence</span></nav>`;
}

/** @param {{readonly evidence: readonly {readonly source: string, readonly path: string, readonly claim: string, readonly quote?: string}[]}} item */
function evidence(item) {
	return item.evidence
		.map(
			(entry) =>
				`<p><span class="badge">${escapeHtml(entry.source)}</span> <span class="mono small">${escapeHtml(entry.path)}</span></p><p>${escapeHtml(entry.claim)}</p>${entry.quote !== undefined && entry.quote !== "" ? `<blockquote>${escapeHtml(entry.quote)}</blockquote>` : ""}`,
		)
		.join("");
}

/** @param {{readonly hardBlockers: readonly {readonly id:string, readonly status:string, readonly evidence: readonly {readonly source:string, readonly path:string, readonly claim:string, readonly quote?:string}[]}[], readonly requirements: readonly {readonly id:string, readonly status:string, readonly evidence: readonly {readonly source:string, readonly path:string, readonly claim:string, readonly quote?:string}[]}[]}} grade */
function checklistEvidence(grade) {
	return `<h3>Hard blockers</h3>${grade.hardBlockers.map((item) => `<h3>${escapeHtml(item.id)} · ${item.status} · ${item.evidence.length} cited</h3>${evidence(item)}`).join("")}<h3>Requirements</h3>${grade.requirements.map((item) => `<h3>${escapeHtml(item.id)} · ${item.status} · ${item.evidence.length} cited</h3>${evidence(item)}`).join("")}`;
}

function runResults() {
	const { run } = data;
	const failed = run.grade.requirements.filter(
		(item) => item.status === "FAIL",
	);
	const passed = run.grade.requirements.filter(
		(item) => item.status === "PASS",
	);
	const build = run.stages.find((item) => item.stage === "build");
	if (build === undefined) {
		throw new Error("Saved Build step missing");
	}
	/** @type {Record<string, string>} */
	const names = {
		location: "Directory location",
		entity: "Entity mapping and defaults",
		"behavior-coverage": "Behavior coverage",
	};
	for (const item of run.grade.requirements) {
		modal(`final-${item.id}`, `Final task Judge · ${item.id}`, evidence(item));
	}
	modal(
		"final-all",
		"Final task Judge · recorded assessment",
		`<p>${escapeHtml(run.grade.summary)}</p>${run.grade.requirements.map((item) => `<h3>${escapeHtml(item.id)} · ${item.status}</h3>${evidence(item)}`).join("")}`,
	);
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
	modal(
		"run-record",
		"Run setup and original readings",
		`<pre>${escapeHtml(JSON.stringify({ run: run.id, model: run.model, judgeModel: run.judgeModel, minimumGrade: run.minimumGrade, stages: run.stages, totals: run.totals }, null, 2))}</pre>`,
	);
	return shell(
		`<header class="top"><div><div class="breadcrumbs">Runs <span>/</span> audit-log <span>/</span> r44</div><h1>r44 <span class="secondary">audit-log</span></h1><div class="sub"><span class="badge">■ Execution ended</span><span>Human review pending</span><span>Oct 15, 14:10</span><span class="mono">sonnet · corpus@0a78c2</span></div></div><div class="top-meters"><div><strong>${money(run.totals.cost.usd)}</strong><span>whole run</span></div><div><strong>20:01</strong><span>elapsed</span></div></div></header>${tabs(["Results", "Activity", "Context & cost"], "Results")}<div class="body"><section class="panel outcome"><div><div class="title"><span class="badge danger">FAIL</span><h2>Final task result</h2></div><p>3 of 14 criteria failed in the independent task Judge.</p></div><div class="actions">${button("Inspect final evidence", "final-all", "primary")}</div></section><div class="step-strip"><div class="eyebrow">Workflow</div><div class="step"><span>01 · Shape <span class="muted small">✓ accepted</span></span><span class="grade">C</span></div><span class="muted">→</span><div class="step selected"><span>02 · Build <span class="small">✓ accepted</span></span><span class="grade">B</span></div>${button("Expand workflow", "run-record", "end quiet")}</div><div class="columns"><section class="panel"><header class="panel-head"><h2>Why the final work failed</h2><span class="small">Recorded task Judge findings</span></header><div class="findings">${failed.map((item) => `<article class="finding"><div class="row"><h3>${escapeHtml(names[item.id] ?? item.id)}</h3><span class="badge danger">FAIL</span></div><p>${escapeHtml(item.evidence[0]?.claim ?? "No claim recorded")}</p><footer><code>${escapeHtml(item.evidence[0]?.path ?? "No path recorded")}</code>${button("View citation ↗", `final-${item.id}`, "quiet")}</footer></article>`).join("")}</div><details class="disclosure"><summary>${passed.length} passed criteria · inspect the complete assessment</summary><p>${passed.map((item) => escapeHtml(item.id)).join(" · ")}</p></details></section><aside class="aside"><section class="panel padded"><h2>Selected step · Build</h2><div class="acceptance"><strong>B</strong><span class="badge">✓ accepted · min F</span></div><p class="small">Step acceptance and final task outcome are graded independently.</p><div class="stat-row"><span class="secondary">Step total</span><span class="mono">${money(build.sessionCost.usd + build.judgeCost.usd)}</span></div><div class="stat-row"><span class="secondary">Execution / Judge</span><span class="mono small">${money(build.sessionCost.usd)} / ${money(build.judgeCost.usd)}</span></div><div class="stat-row"><span class="secondary">Elapsed</span><span class="mono">12:18</span></div><div class="buttons">${button("Inspect Build details", "build-detail")}${button("Inputs & output", "build-io")}${button("Review this Judge", "review-build")}${button("Replay Build", "replay-build")}${button("Test an instruction", "edit-build")}</div><p class="foot">1 saved attempt at this input. No rerun comparison yet.</p></section><section class="panel padded"><h3>Human review</h3><p class="small" style="margin-top:8px">No human review recorded.</p></section></aside></div><div class="details-row"><details class="panel disclosure"><summary>Run setup & provenance</summary><p>Run r44 · sonnet · Judge opus · corpus@0a78c2 · minimum step grade F.</p>${button("Read original measurements", "run-record", "quiet")}</details><details class="panel disclosure"><summary>Earlier final result for this case</summary><p>r22 also failed, on corpus@e73e56. Its corpus differs; this is historical context, not a controlled comparison.</p></details></div></div>`,
	);
}

function replayResults() {
	const { replay } = data;
	const { grade, previousAttempt } = replay;
	/** @type {Record<string, string>} */
	const descriptions = {
		"decision-quality":
			"The questions were genuine product decisions with recommendations grounded in the brief.",
		observability:
			"The infrastructure failure path and NUL handling appear in notes rather than acceptance criteria.",
		"scope-discipline":
			"Exclusions and rejected options are explicit; the Product Owner approved occurredAt.",
		"carry-forward":
			"The record equips the builder, but leaves a validation probe and stale “Open” wording.",
	};
	for (const item of [
		...grade.dimensions,
		...grade.hardBlockers,
		...grade.requirements,
	]) {
		modal(`replay-${item.id}`, `Shape Judge · ${item.id}`, evidence(item));
	}
	modal(
		"replay-checks",
		"Replay · all recorded checks",
		checklistEvidence(grade),
	);
	modal(
		"replay-summary",
		"Replay Judge · complete recorded summary",
		`<p>${escapeHtml(grade.summary)}</p>`,
	);
	modal(
		"replay-original",
		"Replay record and identity",
		`<pre>${escapeHtml(JSON.stringify(replay, null, 2))}</pre>`,
	);
	modal(
		"attempt-comparison",
		"Exploratory readings at the same input",
		"<p>Attempt 1: B, $1.80, 05:43. Attempt 2: B, $1.95, 06:00.</p><p>These are two saved data points without a control arm. They do not establish that an instruction change helped or that quality is equivalent.</p>",
	);
	return shell(
		`<header class="top"><div><div class="breadcrumbs">Runs <span>/</span> audit-log · r35 <span>/</span> Shape <span>/</span> Attempt 2 of 2</div><h1>r39 <span class="secondary">Shape replay</span></h1><div class="sub"><span class="badge">■ Execution ended</span><span>Oct 14, 18:17</span><span class="mono">sonnet · corpus@0a78c2</span></div></div><div class="top-meters"><div><strong>${money(replay.cost)}</strong><span>this attempt</span></div><div><strong>06:00</strong><span>elapsed</span></div></div></header>${tabs(["Results", "Context & cost"], "Results")}<div class="body"><section class="panel padded"><div class="acceptance"><div><div class="eyebrow">Recorded step result</div><h2 style="margin-top:7px">Shape accepted by the step Judge</h2></div><strong>B</strong></div><p class="recorded-summary">The task was shaped with no hard blocker fired and all five requirements passing. Open validation probes and failure behavior recorded only in notes lowered observability and carry-forward to B.</p><div style="margin-top:10px">${button("Read the recorded Judge summary", "replay-summary", "quiet")}</div></section><div class="columns"><section class="panel"><header class="panel-head"><h2>Quality dimensions</h2><span class="small">4 recorded · open any citation</span></header>${grade.dimensions.map((item) => `<div class="score-row"><span>${escapeHtml(item.id.replaceAll("-", " "))}</span><span class="letter">${item.grade}</span><p>${escapeHtml(descriptions[item.id] ?? item.id)}</p>${button(`${item.evidence.length} cited`, `replay-${item.id}`, "quiet")}</div>`).join("")}<details class="disclosure"><summary>5 hard blockers passed · 5 requirements passed</summary><p>${grade.requirements.map((item) => escapeHtml(item.id)).join(" · ")}</p>${button("Inspect all recorded checks", "replay-checks", "quiet")}</details></section><aside class="aside"><section class="panel padded"><h2>At the same frozen input</h2><p class="small mono">audit-log/r35/s0 · shape</p><article class="attempt-card"><div class="row"><span>r38 · Attempt 1</span><span class="mono">B</span></div><div class="sub">${money(previousAttempt.cost)} · ${clock(previousAttempt.elapsedMs)} · corpus@${previousAttempt.corpus}</div></article><article class="attempt-card selected"><div class="row"><span>r39 · Attempt 2</span><span class="mono">B</span></div><div class="sub">$1.95 · 06:00 · corpus@0a78c2</div></article><div class="buttons">${button("Compare saved attempts", "attempt-comparison")}</div><p class="foot">Exploratory readings · no control arm.</p></section><section class="panel padded"><h3>This attempt's spend</h3><div class="stat-row"><span class="secondary">Execution</span><span class="mono">${money(replay.sessionCost)}</span></div><div class="stat-row"><span class="secondary">Judge</span><span class="mono">${money(replay.judgeCost)}</span></div><div class="stat-row"><span class="secondary">Product Owner</span><span class="mono">${money(replay.productOwnerCost)}</span></div>${button("Canonical record & JSON", "replay-original", "quiet")}</section></aside></div><div class="notice"><strong>Transcript not retained for replays.</strong> Saved Judge findings and quoted citations remain inspectable. A step replay has no independent final workflow outcome.</div><div class="below"><span>Input identity and corpus stay attached to this attempt.</span><span>Execution: sonnet · Judge: opus</span></div></div>`,
	);
}

function contextCost() {
	const { context } = data;
	const [request] = context.requests.series.entries;
	if (request === undefined) {
		throw new Error("Saved request missing");
	}
	const { usage } = request;
	const gaps = context.summary.evidence.reasons;
	modal(
		"coverage",
		"Collection gaps · saved evidence",
		`<p>17 recorded-content gaps. Request usage is complete for the one recorded attempt request; text-body evidence is partial. These are separate coverage readings.</p><pre>${escapeHtml(gaps.join("\n"))}</pre>`,
	);
	modal(
		"cost-basis",
		"Provider reported cost and pricing coverage",
		`<p>Provider reported: $0.028023. Calculated request cost is unavailable because no rate is catalogued for claude-opus-5-5. No request was priced.</p><p>The known provider amount is not a calculated per-agent attribution. A zero priced subtotal does not mean the request was free.</p><pre>${escapeHtml(JSON.stringify(context.requests.cost, null, 2))}</pre>`,
	);
	modal(
		"request-data",
		"Recorded request usage",
		`<pre>${escapeHtml(JSON.stringify(request, null, 2))}</pre>`,
	);
	modal(
		"auto-load",
		"Automatic instruction attachment",
		`<p>The saved attachment names <span class="mono">&lt;path&gt;/CLAUDE.md</span> as Project instructions. Reason, trigger and include parent are unavailable.</p><p>This attachment does not establish that the agent followed an instruction. The saved content body is unavailable.</p>`,
	);
	modal(
		"unclassified",
		"Recorded content boundary",
		"<p>19 attempt events and one unclassified recorded-content source are retained. The source reports 620 observed text characters, not tokens. Its content body is unsupported, so a readable source excerpt cannot be presented.</p>",
	);
	modal(
		"events",
		"Recorded attempt events · 19",
		`<p>Saved timestamps and event labels. Text content is unavailable.</p><table><thead><tr><th>Event</th><th>Timestamp</th><th>State</th></tr></thead><tbody>${context.events.map((event) => `<tr><td>${escapeHtml(event.id)} · ${escapeHtml(event.label)}</td><td class="mono small">${escapeHtml(event.timestamp)}</td><td>${escapeHtml(event.state)}</td></tr>`).join("")}</tbody></table>`,
	);
	modal(
		"agents",
		"Session root · saved agent readings",
		"<p>Model: claude-opus-5-5. One retained agent transcript. Provider reported $0.028023; calculated own and descendant cost are unpriced. This request has 3,298 total input tokens. An agent window is not summed with another agent's window.</p>",
	);
	return shell(
		`<header class="top"><div><div class="breadcrumbs">Runs <span>/</span> trunk-biome-svelte-imports · g6 <span>/</span> Attempt 1 of 4</div><h1>Attempt 1 <span class="secondary">Context & cost</span></h1><div class="sub"><span class="badge">Execution ended</span><span>Result: unsuccessful</span><span class="mono">claude-opus-5-5</span></div></div><div class="badge">Selected scope: this attempt</div></header>${tabs(["Results", "Context & cost"], "Context & cost")}<div class="body"><div class="metrics"><section class="panel metric"><div class="eyebrow">Provider reported</div><strong class="value">$0.028023</strong><p>Saved provider amount · ${button("measurement basis", "cost-basis", "quiet")}</p></section><section class="panel metric"><div class="eyebrow">Recorded request input</div><strong class="value">${count(request.totalInputTokens)} tokens</strong><p>1 attempt request · output ${usage.outputTokens} tokens separately</p></section><section class="panel metric"><div class="eyebrow">Calculated cost</div><strong class="value text">Unpriced</strong><p>0 of 1 requests priced · model rate unavailable</p></section></div><div class="notice"><strong>Partial content evidence · 17 gaps.</strong> Request usage is recorded; the source text body is unsupported. ${button("Inspect coverage", "coverage", "quiet")}</div><section class="panel workbench"><nav class="workbench-nav" aria-label="Investigation"><button class="selected" data-inspect="request-data"><span class="row"><strong>Requests</strong><span>1</span></span><span class="item-meta">3,298 input tokens</span></button><button data-inspect="agents"><span class="row"><span>Agents & skills</span><span>1</span></span></button><button data-inspect="unclassified"><span class="row"><span>Sources</span><span>1</span></span></button><button data-inspect="events"><span class="row"><span>Transcript events</span><span>19</span></span></button><h3>Selected request</h3><button class="selected" data-inspect="request-data"><span class="mono small">req_011Cfy9f…</span><span class="item-meta">Session root · attempt region</span></button></nav><article class="workbench-detail"><header><div><h2>Request 1 · Session root</h2><p class="small secondary" style="margin-top:5px">${escapeHtml(request.model)} · line 15 · attempt region</p></div>${button("Original usage", "request-data")}</header><div class="eyebrow">Recorded input composition · ${count(request.totalInputTokens)} tokens</div><div class="usage-bar" role="img" aria-label="2 uncached input tokens, 535 cache read tokens, 2761 cache write tokens"><span class="uncached"></span><span class="cache-read"></span><span class="cache-write"></span></div><div class="usage-key"><span><i class="dot uncached"></i>Uncached <span class="mono">2</span></span><span><i class="dot read"></i>Cache read <span class="mono">535</span></span><span><i class="dot"></i>Cache write <span class="mono">2,761</span></span></div><div class="context-grid"><section class="inset"><h3>Output, counted separately</h3><div class="value">291 tokens</div><p style="margin-top:8px">Output is not part of the input bar.</p></section><section class="inset"><h3>Request cost</h3><div class="value">Unpriced</div><p style="margin-top:8px">No model rate is recorded in the price catalogue.</p></section></div><div class="inset"><h3>Automatic instruction attachment</h3><p class="mono">&lt;path&gt;/CLAUDE.md <span class="muted">· Project</span></p><p style="margin-top:6px">Trigger and include parent unavailable. Source text cannot be shown.</p>${button("Inspect attachment evidence", "auto-load", "quiet")}</div><p class="small muted" style="margin-top:16px">One recorded request; no compaction recorded. This measures input sent at the request, not the model's active context window or its limit.</p></article></section><details class="panel disclosure"><summary>Full provenance, all 17 gap reasons and canonical identities</summary><p class="mono small">${escapeHtml(context.repId)}</p>${button("Inspect coverage", "coverage", "quiet")} · ${button("Cost methodology", "cost-basis", "quiet")}</details></div>`,
	);
}

function comparison() {
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
	modal(
		"comparison-attempts",
		"18 saved attempts · recorded checks",
		`<p>Each arm has six attempts. Per-attempt blocker grading was not recorded.</p><table><thead><tr><th>Attempt</th><th>Baseline words</th><th>Candidate words</th><th>Control words</th></tr></thead><tbody>${comparisonData.attempts[caseId].baseline.map((item, index) => `<tr><td>${index + 1} · all checks pass</td><td>${item.words.words}</td><td>${comparisonData.attempts[caseId].candidate[index]?.words.words ?? "Unavailable"}</td><td>${comparisonData.attempts[caseId].control[index]?.words.words ?? "Unavailable"}</td></tr>`).join("")}</tbody></table>`,
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
	const rows = [
		{
			label: "Recorded checks",
			before: "6/6 passed",
			after: "6/6 passed",
			range: "Both arms · observed 6 of 6",
			delta: "Unchanged, already clear · each arm 61–100% interval",
		},
		{
			label: "Reply length",
			before: "192 words",
			after: "201 words",
			range: "Baseline 138–247 · candidate 125–258",
			delta: "+4% · inside rerun noise",
		},
		{
			label: "Cost per attempt",
			before: "$1.10",
			after: "$1.16",
			range: "Baseline $0.31–$1.74 · candidate $0.42–$1.59",
			delta: "+6% · inside rerun noise",
		},
	];
	return shell(
		`<header class="top"><div><div class="breadcrumbs">Comparisons <span>/</span> triage-inbox-cut</div><h1>Triage instruction edit</h1><div class="sub"><span>Session case</span><span>6 attempts per arm · 18 total</span><span>2 changed files</span></div></div><div class="top-meters"><div><strong>$14.70</strong><span>recorded total</span></div></div></header><div class="body"><section class="panel comparison-summary"><div><h2>No change in recorded check outcomes</h2><p>All three arms passed 6 of 6 attempts. Against baseline, candidate cost and reply-length changes are inside rerun noise; equal passing checks do not establish equal overall quality. Both edited corpora cost more than the supplied control.</p></div>${button("Inspect attempts", "comparison-attempts", "primary")}</section><div class="arm-cards">${arms.map((arm) => `<section class="panel arm ${arm === "candidate" ? "selected" : ""}"><div class="role"><h3>${labels[arm]} <span class="muted small">${descriptions[arm]}</span></h3><span class="mono small secondary">${versions[arm].digest.slice(0, 6)}</span></div><span class="ratio">6/6</span><span class="checks">checks passed</span><div class="cost">${money(figures[arm].cost.perAttemptUsd)} <span class="small secondary">per attempt</span></div><p class="sub">${money(figures[arm].cost.totalUsd)} total · avg ${Math.round(figures[arm].words.averageWords)} words</p></section>`).join("")}</div><section class="panel"><header class="panel-head"><h2>What moved · candidate against baseline</h2><div>${button("All contrasts & control", "control-readings", "quiet")} · ${button("Measurement method", "comparison-method", "quiet")}</div></header><table><thead><tr><th class="table-measure">Measure</th><th>Baseline</th><th>Candidate</th><th>Reading</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${row.label}<small>${row.range}</small></td><td class="mono">${row.before}</td><td class="mono">${row.after}</td><td>${row.delta}</td></tr>`).join("")}</tbody></table></section><section class="panel attribution"><div><h3>Two files changed; single-file attribution is refused</h3><p class="mono small">skills/triage/SKILL.md · skills/triage/references/inbox.md</p></div>${button("Inspect corpus difference", "attribution")}</section><div class="notice"><strong>6 attempts per arm.</strong> The smallest detectable shift is not computed. Blocker grading was not recorded for these attempts. ${button("Read limitations", "comparison-method", "quiet")}</div><details class="panel disclosure"><summary>All attempts, control construction and extension availability</summary><p>Control: supplied minimal corpus; its construction was not recorded. More attempts cannot be added from this saved report.</p>${button("All 18 attempts", "comparison-attempts", "quiet")}</details></div>`,
		"Comparisons",
	);
}

modal(
	"view-guidance",
	"Design review screen",
	"<p>This standalone proposal illustrates the selected screen. The comparison gallery lets you switch between the current product and this proposed layout using the same recorded evidence. No product action is executed here.</p>",
);
/** @type {Record<string, () => string>} */
const renderers = {
	results: runResults,
	attempt: replayResults,
	context: contextCost,
	comparison,
};
const render = Object.hasOwn(renderers, screen) ? renderers[screen] : undefined;
app.innerHTML = (render ?? runResults)();
required("#close-inspector", HTMLButtonElement).addEventListener(
	"click",
	() => {
		inspector.close();
	},
);
document.addEventListener("click", (event) => {
	if (!(event.target instanceof Element)) {
		return;
	}
	const trigger = event.target.closest("button[data-inspect]");
	if (!(trigger instanceof HTMLButtonElement)) {
		return;
	}
	const content = modals.get(trigger.dataset["inspect"] ?? "");
	if (!content) {
		throw new Error("Unknown inspector");
	}
	required("#inspector-title", HTMLElement).textContent = content.title;
	required("#inspector-body", HTMLElement).innerHTML = content.content;
	inspector.showModal();
});
await document.fonts.ready;
document.body.dataset["ready"] = "true";
