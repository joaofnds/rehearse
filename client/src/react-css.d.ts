export type CustomProperty = `--${string}`;

declare module "react" {
	interface CSSProperties extends Record<
		CustomProperty,
		string | number | undefined
	> {}
}
