import {
	button,
	checklistEvidence,
	clock,
	escapeHtml,
	evidence,
	money,
	shell,
	tabs,
} from "./screen-components.js";
import { modal } from "./screen-inspector.js";
import data from "./selected-records.json" with { type: "json" };

const JSON_INDENT_SPACES = 2;

function replayResults() {
	const { replay } = data;
	const { grade, previousAttempt } = replay;
	/** @type {Record<string, string>} */
	const descriptions = {
		"carry-forward":
			"The record equips the builder, but leaves a validation probe and stale “Open” wording.",
		"decision-quality":
			"The questions were genuine product decisions with recommendations grounded in the brief.",
		observability:
			"The infrastructure failure path and NUL handling appear in notes rather than acceptance criteria.",
		"scope-discipline":
			"Exclusions and rejected options are explicit; the Product Owner approved occurredAt.",
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
		`<pre>${escapeHtml(JSON.stringify(replay, null, JSON_INDENT_SPACES))}</pre>`,
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
export { replayResults as default };
