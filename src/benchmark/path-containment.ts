import { relative, sep } from "node:path";

function pathIsWithin(candidate: string, root: string): boolean {
	const fromRoot = relative(root, candidate);

	return (
		fromRoot === "" || (!fromRoot.startsWith(`..${sep}`) && fromRoot !== "..")
	);
}

export { pathIsWithin as default };
