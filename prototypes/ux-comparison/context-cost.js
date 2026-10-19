import { button, count, escapeHtml, shell, tabs } from "./screen-components.js";
import { modal } from "./screen-inspector.js";
import data from "./selected-records.json" with { type: "json" };

const JSON_INDENT_SPACES = 2;

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
		`<p>Provider reported: $0.028023. Calculated request cost is unavailable because no rate is catalogued for claude-opus-5-5. No request was priced.</p><p>The known provider amount is not a calculated per-agent attribution. A zero priced subtotal does not mean the request was free.</p><pre>${escapeHtml(JSON.stringify(context.requests.cost, null, JSON_INDENT_SPACES))}</pre>`,
	);

	const investigation = contextInvestigation(request);

	return shell(
		`<header class="top"><div><div class="breadcrumbs">Runs <span>/</span> trunk-biome-svelte-imports · g6 <span>/</span> Attempt 1 of 4</div><h1>Attempt 1 <span class="secondary">Context & cost</span></h1><div class="sub"><span class="badge">Execution ended</span><span>Result: unsuccessful</span><span class="mono">claude-opus-5-5</span></div></div><div class="badge">Selected scope: this attempt</div></header>${tabs(["Results", "Context & cost"], "Context & cost")}<div class="body"><div class="metrics"><section class="panel metric"><div class="eyebrow">Provider reported</div><strong class="value">$0.028023</strong><p>Saved provider amount · ${button("measurement basis", "cost-basis", "quiet")}</p></section><section class="panel metric"><div class="eyebrow">Recorded request input</div><strong class="value">${count(request.totalInputTokens)} tokens</strong><p>1 attempt request · output ${usage.outputTokens} tokens separately</p></section><section class="panel metric"><div class="eyebrow">Calculated cost</div><strong class="value text">Unpriced</strong><p>0 of 1 requests priced · model rate unavailable</p></section></div><div class="notice"><strong>Partial content evidence · 17 gaps.</strong> Request usage is recorded; the source text body is unsupported. ${button("Inspect coverage", "coverage", "quiet")}</div>${investigation}<details class="panel disclosure"><summary>Full provenance, all 17 gap reasons and canonical identities</summary><p class="mono small">${escapeHtml(context.repId)}</p>${button("Inspect coverage", "coverage", "quiet")} · ${button("Cost methodology", "cost-basis", "quiet")}</details></div>`,
	);
}
/**
 * @typedef {{readonly model:string, readonly totalInputTokens:number}} InvestigationRequest
 * @param {InvestigationRequest} request
 */
function contextInvestigation(request) {
	const { context } = data;

	modal(
		"request-data",
		"Recorded request usage",
		`<pre>${escapeHtml(JSON.stringify(request, null, JSON_INDENT_SPACES))}</pre>`,
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

	return `<section class="panel workbench"><nav class="workbench-nav" aria-label="Investigation"><button class="selected" data-inspect="request-data"><span class="row"><strong>Requests</strong><span>1</span></span><span class="item-meta">3,298 input tokens</span></button><button data-inspect="agents"><span class="row"><span>Agents & skills</span><span>1</span></span></button><button data-inspect="unclassified"><span class="row"><span>Sources</span><span>1</span></span></button><button data-inspect="events"><span class="row"><span>Transcript events</span><span>19</span></span></button><h3>Selected request</h3><button class="selected" data-inspect="request-data"><span class="mono small">req_011Cfy9f…</span><span class="item-meta">Session root · attempt region</span></button></nav><article class="workbench-detail"><header><div><h2>Request 1 · Session root</h2><p class="small secondary" style="margin-top:5px">${escapeHtml(request.model)} · line 15 · attempt region</p></div>${button("Original usage", "request-data")}</header><div class="eyebrow">Recorded input composition · ${count(request.totalInputTokens)} tokens</div><div class="usage-bar" role="img" aria-label="2 uncached input tokens, 535 cache read tokens, 2761 cache write tokens"><span class="uncached"></span><span class="cache-read"></span><span class="cache-write"></span></div><div class="usage-key"><span><i class="dot uncached"></i>Uncached <span class="mono">2</span></span><span><i class="dot read"></i>Cache read <span class="mono">535</span></span><span><i class="dot"></i>Cache write <span class="mono">2,761</span></span></div><div class="context-grid"><section class="inset"><h3>Output, counted separately</h3><div class="value">291 tokens</div><p style="margin-top:8px">Output is not part of the input bar.</p></section><section class="inset"><h3>Request cost</h3><div class="value">Unpriced</div><p style="margin-top:8px">No model rate is recorded in the price catalogue.</p></section></div><div class="inset"><h3>Automatic instruction attachment</h3><p class="mono">&lt;path&gt;/CLAUDE.md <span class="muted">· Project</span></p><p style="margin-top:6px">Trigger and include parent unavailable. Source text cannot be shown.</p>${button("Inspect attachment evidence", "auto-load", "quiet")}</div><p class="small muted" style="margin-top:16px">One recorded request; no compaction recorded. This measures input sent at the request, not the model's active context window or its limit.</p></article></section>`;
}
export { contextCost as default };
