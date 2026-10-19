import type { ReactNode } from "react";

interface SectionLabelProps {
	readonly children: ReactNode;
}

function SectionLabel({ children }: SectionLabelProps): React.JSX.Element {
	return (
		<span className="text-12 tracking-label text-dim uppercase">
			{children}
		</span>
	);
}

export { SectionLabel as default };
