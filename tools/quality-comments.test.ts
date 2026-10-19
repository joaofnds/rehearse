import { describe, expect, it } from "bun:test";

import { failureOf } from "#cli/cli-test-support";

import { qualitySourceFailures } from "./quality-policy";

const FIRST_SOURCE_LINE = 1;
const DIRECTIVE_AFTER_LITERAL_LINE = 2;
const MARKDOWN_DIRECTIVE_LINE = 3;

const quotedExamples = [
	{
		path: "src/expect-error.ts",
		source: 'const example = "// @ts-expect-error";',
	},
	{
		path: "src/quoted.ts",
		source: 'const example = "// oxlint-disable-next-line no-unused-vars";',
	},
	{
		path: "src/escaped.ts",
		source: 'const example = "\\" // oxlint-disable-next-line no-unused-vars";',
	},
	{
		path: "src/template.ts",
		source:
			"const example = `// oxlint-disable-next-line no-unused-vars\\n/* prettier-ignore */`;",
	},
	{
		path: "src/regexp.js",
		source: "const example = /[// eslint ]no-unused-vars/;",
	},
	{
		path: "client/text.tsx",
		source:
			"const example = <p>// oxlint-disable-next-line no-unused-vars</p>;",
	},
	{
		path: "client/attribute.jsx",
		source:
			'const example = <p title="// oxlint-disable-next-line no-unused-vars" />;',
	},
	{
		path: "src/literal.ts",
		source: 'type Example = "// oxlint-disable-next-line no-unused-vars";',
	},
	{
		path: "client/content.css",
		source: '.example::before { content: "/* prettier-ignore */"; }',
	},
	{
		path: "settings.json",
		source: '{"example": "// oxlint-disable-next-line no-unused-vars"}',
	},
	{
		path: "settings.jsonc",
		source: '{"example": "/* prettier-ignore */"}',
	},
	{
		path: "docs/inline.md",
		source: "`<!-- prettier-ignore -->`",
	},
	{
		path: "docs/fenced.md",
		source: "```html\n<!-- prettier-ignore -->\n```",
	},
	{
		path: "docs/indented.md",
		source: "    <!-- prettier-ignore -->",
	},
	{
		path: "docs/attribute.md",
		source: '<span title="<!-- prettier-ignore -->">example</span>',
	},
	{
		path: "settings.toml",
		source: 'example = "# prettier-ignore"',
	},
	{
		path: "literal.toml",
		source: "example = '# prettier-ignore'",
	},
	{
		path: "multiline.toml",
		source: 'example = """\n# prettier-ignore\n"""',
	},
	{
		path: "multiline-literal.toml",
		source: "example = '''\n# prettier-ignore\n'''",
	},
	{
		path: "settings.yml",
		source: 'example: "# prettier-ignore"',
	},
	{
		path: "block.yml",
		source: "example: |\n  # prettier-ignore",
	},
	{
		path: "client/attribute.html",
		source: '<p title="<!-- prettier-ignore -->">example</p>',
	},
	{
		path: "client/script.html",
		source: '<script>const example = "<!-- prettier-ignore -->";</script>',
	},
];

const directiveExamples = [
	{
		lines: [FIRST_SOURCE_LINE],
		path: "src/expect-error.ts",
		source: "// @ts-expect-error\nconst value = 1;",
	},
	{
		lines: [DIRECTIVE_AFTER_LITERAL_LINE],
		path: "src/example.ts",
		source:
			'const example = "// oxlint-disable-next-line no-unused-vars";\n// oxlint-disable-next-line no-unused-vars',
	},
	{
		lines: [FIRST_SOURCE_LINE],
		path: "src/template.ts",
		source: `const example = \`literal \${ /* prettier-ignore */ 1 }\`;`,
	},
	{
		lines: [FIRST_SOURCE_LINE],
		path: "client/example.tsx",
		source: "const example = <p>{/* prettier-ignore */}text</p>;",
	},
	{
		lines: [DIRECTIVE_AFTER_LITERAL_LINE],
		path: "client/example.css",
		source:
			'.example::before { content: "/* prettier-ignore */"; }\n/* prettier-ignore */',
	},
	{
		lines: [DIRECTIVE_AFTER_LITERAL_LINE],
		path: "settings.jsonc",
		source: '{"example":"/* prettier-ignore */"}\n/* prettier-ignore */',
	},
	{
		lines: [MARKDOWN_DIRECTIVE_LINE],
		path: "docs/example.md",
		source: "`<!-- prettier-ignore -->`\n\n<!-- prettier-ignore -->",
	},
	{
		lines: [DIRECTIVE_AFTER_LITERAL_LINE],
		path: "settings.toml",
		source: 'example = "# prettier-ignore"\n# prettier-ignore',
	},
	{
		lines: [DIRECTIVE_AFTER_LITERAL_LINE],
		path: "settings.yml",
		source: 'example: "# prettier-ignore"\n# prettier-ignore',
	},
	{
		lines: [DIRECTIVE_AFTER_LITERAL_LINE],
		path: "client/example.html",
		source:
			'<p title="<!-- prettier-ignore -->">example</p>\n<!-- prettier-ignore -->',
	},
	{
		lines: [DIRECTIVE_AFTER_LITERAL_LINE],
		path: "client/script.html",
		source:
			'<script>const example = "// oxlint-disable-next-line no-unused-vars";\n// oxlint-disable-next-line no-unused-vars\n</script>',
	},
	{
		lines: [DIRECTIVE_AFTER_LITERAL_LINE],
		path: "client/style.html",
		source:
			'<style>.example::before {content: "/* prettier-ignore */";}\n/* prettier-ignore */\n</style>',
	},
];

describe("quality comment boundaries", () => {
	it.each(quotedExamples)(
		"accepts literal directive examples in $path",
		async ({ path, source }) => {
			expect(await qualitySourceFailures(path, source)).toEqual([]);
		},
	);

	it.each(directiveExamples)(
		"rejects actual directive comments in $path",
		async ({ path, source, lines }) => {
			expect(await qualitySourceFailures(path, source)).toEqual(
				lines.map(
					(line) =>
						`${path}:${String(line)}: quality-check suppression is forbidden`,
				),
			);
		},
	);
	it.each(["example.mdx", "example.scss", "example.sass", "example.less"])(
		"refuses an unsupported maintained language in %s",
		async (path) => {
			const failure = await failureOf(qualitySourceFailures(path, ""));

			expect(failure).toEqual(
				new Error(
					`Quality policy cannot inspect ${path}: add a native comment parser for ${path.slice("example".length)} before adding this maintained file`,
				),
			);
		},
	);
});
