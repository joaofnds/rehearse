import required from "./dom.js";

/** @type {Map<string, {title: string, content: string}>} */
const modals = new Map();

/** @param {string} key @param {string} title @param {string} content */
function modal(key, title, content) {
	modals.set(key, { content, title });
	return key;
}
/**
 * @typedef {{readonly showModal:()=>void, readonly close:()=>void}} InspectorDialog
 * @typedef {{readonly inspector:InspectorDialog, readonly title:string, readonly content:string}} InspectionRequest
 * @param {InspectionRequest} request
 */
function showInspection({ inspector, title, content }) {
	required("#inspector-title", HTMLElement).textContent = title;
	required("#inspector-body", HTMLElement).innerHTML = content;
	inspector.showModal();
}
/** @param {InspectorDialog} inspector */
function connectInspector(inspector) {
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
		if (content === undefined) {
			throw new Error("Unknown inspector");
		}

		showInspection({ inspector, ...content });
	});
}
export { modal, connectInspector };
