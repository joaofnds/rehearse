import { describe, expect, it } from "bun:test";
import { fireEvent, render, screen } from "@testing-library/react";
import { RecordedText } from "./recorded-text";

async function renderFormattedWithinDeadline(text: string): Promise<string> {
	const source = [
		'import { createElement } from "react";',
		'import { renderToStaticMarkup } from "react-dom/server";',
		'import { RecordedText } from "./client/src/system/components/recorded-text.tsx";',
		`console.log(renderToStaticMarkup(createElement(RecordedText, { text: ${JSON.stringify(text)} })));`,
	].join("\n");
	const child = Bun.spawn({
		cmd: [process.execPath, "--eval", source],
		env: { ...Bun.env },
		stdout: "pipe",
		stderr: "pipe",
		timeout: 2000,
		killSignal: "SIGKILL",
	});
	const [exit, html, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	expect({ exit, stderr }).toEqual({ exit: 0, stderr: "" });

	return html;
}

describe(RecordedText.name, () => {
	it("formats saved headings, lists and code while retaining the exact raw source", () => {
		const text =
			"# Delivery\n\n- **First** item\n- `Second` item\n\n```ts\nconst message = '<example>';\n```\n";
		const { container } = render(<RecordedText text={text} />);

		expect(
			screen.getByRole("heading", { name: "Delivery" }),
		).toBeInTheDocument();
		expect(screen.getAllByRole("listitem")).toHaveLength(2);
		expect(container.querySelector("pre code")?.textContent).toBe(
			"const message = '<example>';",
		);
		fireEvent.click(screen.getByRole("button", { name: "Raw" }));

		expect(container.querySelector("pre")?.textContent).toBe(text);
	});

	it("reads indented or empty headings and continues to the following saved text", () => {
		const text =
			"   # Indented heading\n\n# \n\nParagraph after empty heading.";
		const { container } = render(<RecordedText text={text} />);

		expect(
			screen.getByRole("heading", { name: "Indented heading" }),
		).toBeInTheDocument();
		expect(
			screen.getByText("Paragraph after empty heading."),
		).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Raw" }));

		expect(container.querySelector("pre")?.textContent).toBe(text);
	});

	it.each([
		["# a\rseparator-content-retained", "h3", "a\nseparator-content-retained"],
		[
			"- a\u2028separator-content-retained",
			"li",
			"a\u2028separator-content-retained",
		],
		[
			"+ a\u2029separator-content-retained",
			"li",
			"a\u2029separator-content-retained",
		],
	])(
		"finishes formatting embedded line separators in %p within the deadline and keeps Raw exact",
		async (text, element, expected) => {
			const formatted = await renderFormattedWithinDeadline(text);
			const document = new DOMParser().parseFromString(formatted, "text/html");
			const { container } = render(
				<RecordedText text={text} initialMode="Raw" />,
			);

			expect(
				document.querySelector(element)?.textContent.replaceAll("\r", "\n"),
			).toBe(expected);
			expect(container.querySelector("pre")?.textContent).toBe(text);
		},
	);

	it.each(["`", "**", "`first\nsecond`"])(
		"retains unmatched inline markers in %p as literal text",
		(text) => {
			const { container } = render(<RecordedText text={text} />);

			expect(container.querySelector("p")?.textContent).toBe(text);
			expect(container.querySelector("code, strong")).toBeNull();
		},
	);

	it("keeps saved HTML as literal text in both reading modes", () => {
		const text =
			"<script>window.changed = true</script>\n<img src=x onerror=bad()>";
		const { container } = render(<RecordedText text={text} />);

		expect(container.querySelector("script, img")).toBeNull();
		expect(container).toHaveTextContent(
			"<script>window.changed = true</script>",
		);
		fireEvent.click(screen.getByRole("button", { name: "Raw" }));

		expect(container.querySelector("script, img")).toBeNull();
		expect(container.querySelector("pre")?.textContent).toBe(text);
	});
});
