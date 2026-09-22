export const GRADE_SIZES = ["13", "19", "20", "22", "24", "30"] as const;

export type GradeSize = (typeof GRADE_SIZES)[number];

export type GradeValue =
	| { readonly letter: string }
	| { readonly pending: true };

const SIZE_CLASSES = {
	"13": "font-mono text-base font-bold",
	"19": "font-mono text-2xl leading-none font-bold",
	"20": "font-mono text-2xl font-bold",
	"22": "font-mono text-2xl font-bold",
	"24": "font-mono text-3xl font-bold",
	"30": "font-mono text-4xl font-bold",
} as const satisfies Record<GradeSize, string>;

export function Grade({
	value,
	size,
}: {
	readonly value: GradeValue;
	readonly size: GradeSize;
}): React.JSX.Element {
	return (
		<span className={SIZE_CLASSES[size]}>
			{"pending" in value ? "—" : value.letter}
		</span>
	);
}
