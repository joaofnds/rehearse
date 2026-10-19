const MISSING_FIELD_POSITION = -1;
const PATH_SEGMENT_INDEX_STEP = 1;
const EQUAL_FIELD_POSITION = 0;
interface ValidationRefinement {
	readonly code: string;
	readonly path: readonly string[];
}

interface ValidationFieldOrder {
	readonly children?: Readonly<Record<string, ValidationFieldOrder>>;
	readonly fields: readonly string[];
	readonly refinements?: readonly ValidationRefinement[];
	readonly values?: ValidationFieldOrder;
}

const NO_FIELD_ORDER: ValidationFieldOrder = { fields: [] };

function fieldPosition(
	field: PropertyKey,
	order: ValidationFieldOrder,
): number {
	if (Number.isInteger(field)) {
		return Number(field);
	}
	const position = order.fields.indexOf(String(field));
	return position === MISSING_FIELD_POSITION ? order.fields.length : position;
}

function isRefinement(
	issue: Pick<ValidationIssue, "code">,
	issuePath: readonly PropertyKey[],
	order: ValidationFieldOrder,
): boolean {
	const path = issuePath
		.filter((field) => !Number.isInteger(field))
		.map(String);
	return (
		order.refinements?.some(
			(refinement) =>
				refinement.code === issue.code &&
				refinement.path.length === path.length &&
				refinement.path.every((field, index) => field === path[index]),
		) ?? false
	);
}

interface PathSegmentComparison {
	readonly left: ValidationIssue;
	readonly right: ValidationIssue;
	readonly index: number;
	readonly order: ValidationFieldOrder;
}

function compareFields(
	left: PropertyKey | undefined,
	right: PropertyKey | undefined,
	order: ValidationFieldOrder,
): number | undefined {
	if (left !== undefined && right !== undefined) {
		const difference = fieldPosition(left, order) - fieldPosition(right, order);
		if (difference !== EQUAL_FIELD_POSITION || left !== right) {
			return difference;
		}
	}

	return undefined;
}

function comparePathSegment({
	left,
	right,
	index,
	order,
}: PathSegmentComparison): number | undefined {
	const leftField = left.path[index];
	const rightField = right.path[index];
	if (!Number.isInteger(leftField) && !Number.isInteger(rightField)) {
		const leftRefinement = isRefinement(left, left.path.slice(index), order);
		const rightRefinement = isRefinement(right, right.path.slice(index), order);
		if (leftRefinement || rightRefinement) {
			return Number(leftRefinement) - Number(rightRefinement);
		}
	}

	return compareFields(leftField, rightField, order);
}

function comparePaths(
	left: ValidationIssue,
	right: ValidationIssue,
	fieldOrder: ValidationFieldOrder,
): number {
	let order = fieldOrder;
	for (
		let index = 0;
		index <= Math.min(left.path.length, right.path.length);
		index += PATH_SEGMENT_INDEX_STEP
	) {
		const difference = comparePathSegment({ index, left, order, right });
		if (difference !== undefined) {
			return difference;
		}

		const leftField = left.path[index];
		if (leftField !== undefined && right.path[index] !== undefined) {
			order = orderAtPath([leftField], order);
		}
	}

	return right.path.length - left.path.length;
}

function orderAtPath(
	path: readonly PropertyKey[],
	fieldOrder: ValidationFieldOrder,
): ValidationFieldOrder {
	let order = fieldOrder;
	for (const part of path) {
		if (!Number.isInteger(part)) {
			const field = String(part);
			order =
				order.children !== undefined && Object.hasOwn(order.children, field)
					? (order.children[field] ?? NO_FIELD_ORDER)
					: (order.values ?? NO_FIELD_ORDER);
		}
	}
	return order;
}

interface ValidationIssue {
	readonly code?: string;
	readonly errors?: readonly (readonly ValidationIssue[])[];
	readonly path: readonly PropertyKey[];
}

interface ValidationIssueOrder<Issue extends ValidationIssue> {
	readonly error: { readonly issues: readonly Issue[] };
	readonly order: ValidationFieldOrder;
}

/** Public diagnostics keep their field priority when schema declarations move. */
function orderedValidationIssues<Issue extends ValidationIssue>({
	error,
	order,
}: ValidationIssueOrder<Issue>): readonly Issue[] {
	const issues = error.issues.map((issue) => {
		if (issue.errors === undefined) {
			return issue;
		}
		const nestedOrder = orderAtPath(issue.path, order);
		const errors = issue.errors.map((branch) =>
			orderedValidationIssues({
				error: { issues: branch },
				order: nestedOrder,
			}),
		);
		return { ...issue, errors };
	});
	return issues.toSorted((left, right) => comparePaths(left, right, order));
}

export { orderedValidationIssues as default };
export type { ValidationFieldOrder };
