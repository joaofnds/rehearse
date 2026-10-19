const USD_FRACTION_DIGITS = 2;
const MS_PER_MINUTE = 60_000;
const CLOCK_FIELD_DIGITS = 2;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;
/** @param {string} value */
const escapeHtml = (value) =>
	value.replaceAll(
		/[&<>"']/gu,
		(letter) =>
			({ '"': "&quot;", "&": "&amp;", "'": "&#39;", "<": "&lt;", ">": "&gt;" })[
				letter
			] ?? letter,
	);

/** @param {number} value */
const money = (value) => `$${value.toFixed(USD_FRACTION_DIGITS)}`;

/** @param {number} value */
const count = (value) => value.toLocaleString("en-US");

/** @param {number} milliseconds */
const clock = (milliseconds) =>
	`${String(Math.floor(milliseconds / MS_PER_MINUTE)).padStart(CLOCK_FIELD_DIGITS, "0")}:${String(Math.floor(milliseconds / MS_PER_SECOND) % SECONDS_PER_MINUTE).padStart(CLOCK_FIELD_DIGITS, "0")}`;

/** @param {'Runs'|'Comparisons'|'Cases'|'Corpus'|'Settings'} name */
const icon = (name) => {
	const paths = {
		Cases: "m12 3 9 5v8l-9 5-9-5V8l9-5Zm0 9 9-4M12 12 3 8m9 4v9",
		Comparisons:
			"M6 3v10a5 5 0 0 0 5 5h7M3 6l3-3 3 3m6 9 3 3-3 3M18 3v5a4 4 0 0 1-4 4H6",
		Corpus: "M7 3h12v17H7M7 6H3v15h13M10 7h6m-6 4h6m-6 4h6",
		Runs: "M3 5h2m3 0h13M3 12h2m3 0h13M3 19h2m3 0h13",
		Settings: "M3 6h18M3 12h18M3 18h18M8 3v6m8 0v6m-7 0v6",
	};
	return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
};

/** @param {string} label @param {string} key @param {string} classes */
function button(label, key, classes = "") {
	return `<button class="${classes}" data-inspect="${escapeHtml(key)}">${label}</button>`;
}

/** @param {string} content @param {string} active */
function shell(content, active = "Runs") {
	/** @type {('Runs'|'Comparisons'|'Cases'|'Corpus'|'Settings')[]} */
	const items = ["Runs", "Comparisons", "Cases", "Corpus", "Settings"];
	const counts = {
		Cases: "",
		Comparisons: "5",
		Corpus: "137",
		Runs: "190",
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
export {
	escapeHtml,
	money,
	count,
	clock,
	icon,
	button,
	shell,
	tabs,
	evidence,
	checklistEvidence,
};
