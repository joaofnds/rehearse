import comparison from "./comparison-results.js";
import contextCost from "./context-cost.js";
import required from "./dom.js";
import replayResults from "./replay-results.js";
import runResults from "./run-results.js";
import { connectInspector, modal } from "./screen-inspector.js";

const screen = new URLSearchParams(location.search).get("screen") ?? "results";

const app = required("#app", HTMLElement);

const inspector = required("#inspector", HTMLDialogElement);
modal(
	"view-guidance",
	"Design review screen",
	"<p>This standalone proposal illustrates the selected screen. The comparison gallery lets you switch between the current product and this proposed layout using the same recorded evidence. No product action is executed here.</p>",
);
/** @type {Record<string, () => string>} */
const renderers = {
	attempt: replayResults,
	comparison,
	context: contextCost,
	results: runResults,
};
const render = Object.hasOwn(renderers, screen) ? renderers[screen] : undefined;
app.innerHTML = (render ?? runResults)();
connectInspector(inspector);
await document.fonts.ready;
document.body.dataset["ready"] = "true";
