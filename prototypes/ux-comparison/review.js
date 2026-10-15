import { required } from "./dom.js";

const scenes = [...document.querySelectorAll(".scene")].filter(
	(item) => item instanceof HTMLElement,
);
const choices = [...document.querySelectorAll("button[data-choose]")].filter(
	(item) => item instanceof HTMLButtonElement,
);
const modes = [...document.querySelectorAll("button[data-mode]")].filter(
	(item) => item instanceof HTMLButtonElement,
);
const inspector = required("#image-inspector", HTMLDialogElement);
const zoomImage = required("#zoom-image", HTMLImageElement);
const openProposal = required("#open-proposal", HTMLAnchorElement);
const params = new URLSearchParams(location.search);
let scene = params.get("screen") ?? "results";
if (!scenes.some((item) => item.dataset["scene"] === scene)) {
	scene = "results";
}
let mode = params.get("mode") ?? "after";
if (!["before", "after", "side"].includes(mode)) {
	mode = "after";
}

function render() {
	for (const section of scenes) {
		section.hidden = section.dataset["scene"] !== scene;
	}
	for (const choice of choices) {
		choice.setAttribute(
			"aria-pressed",
			String(choice.dataset["choose"] === scene),
		);
	}
	for (const choice of modes) {
		choice.setAttribute(
			"aria-pressed",
			String(choice.dataset["mode"] === mode),
		);
	}
	document.body.dataset["mode"] = mode;
	required("#zoom", HTMLButtonElement).textContent =
		mode === "side" ? "Inspect After at 1:1" : "Inspect at 1:1";
	openProposal.href = `saved-example.html?screen=${scene}`;
	history.replaceState(null, "", `?screen=${scene}&mode=${mode}`);
}

required(".scene-nav", HTMLElement).addEventListener("click", (event) => {
	if (!(event.target instanceof Element)) {
		return;
	}
	const choice = event.target.closest("button[data-choose]");
	if (!(choice instanceof HTMLButtonElement)) {
		return;
	}
	scene = choice.dataset["choose"] ?? "results";
	render();
});
required(".modes", HTMLElement).addEventListener("click", (event) => {
	if (!(event.target instanceof Element)) {
		return;
	}
	const choice = event.target.closest("button[data-mode]");
	if (!(choice instanceof HTMLButtonElement)) {
		return;
	}
	mode = choice.dataset["mode"] ?? "after";
	render();
});
required("#zoom", HTMLButtonElement).addEventListener("click", () => {
	const section = scenes.find((item) => item.dataset["scene"] === scene);
	const screenshot = section?.querySelector(
		mode === "before" ? ".before img" : ".after img",
	);
	if (!(screenshot instanceof HTMLImageElement)) {
		throw new Error("Missing screenshot");
	}
	zoomImage.src = screenshot.src;
	zoomImage.alt = screenshot.alt;
	required("#zoom-title", HTMLElement).textContent =
		`${section?.querySelector("h2")?.textContent} · ${mode === "before" ? "Before" : "After"}`;
	inspector.showModal();
});
required("#close-zoom", HTMLButtonElement).addEventListener("click", () => {
	inspector.close();
});
document.addEventListener("keydown", (event) => {
	if (
		inspector.open ||
		event.altKey ||
		event.ctrlKey ||
		event.metaKey ||
		(event.target instanceof Element &&
			event.target.matches("input,textarea,select"))
	) {
		return;
	}
	if (event.key === "1" || event.key === "2") {
		mode = event.key === "1" ? "before" : "after";
		render();
	}
	if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
		event.preventDefault();
		const index = choices.findIndex((item) => item.dataset["choose"] === scene);
		scene =
			choices[
				(index + (event.key === "ArrowRight" ? 1 : -1) + choices.length) %
					choices.length
			]?.dataset["choose"] ?? "results";
		render();
	}
});
render();
