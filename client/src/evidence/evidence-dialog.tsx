import { Link } from "@tanstack/react-router";
import type { MouseEvent, ReactNode } from "react";
import { useRef, useState } from "react";

import ActionGroup from "#client/system/components/action-group";
import { Button } from "#client/system/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogTitle,
	DialogTrigger,
} from "#client/system/ui/dialog";

import EvidenceSourcePage from "./evidence-source-page";
import type { EvidenceSourceIdentity } from "./evidence-source-query";

const PRIMARY_POINTER_BUTTON = 0;

function evidenceHref(identity: EvidenceSourceIdentity): string {
	const run = encodeURIComponent(identity.run);
	const item = encodeURIComponent(identity.item);
	const index = encodeURIComponent(identity.index);
	if (identity.kind === "final") {
		return `/runs/${run}/final/evidence/${item}/${index}`;
	}
	return `/runs/${run}/stages/${encodeURIComponent(identity.stage)}/evidence/${encodeURIComponent(identity.section)}/${item}/${index}`;
}

/** A primary click inspects the citation beside its source run; the href remains shareable. */
interface EvidenceDialogLinkProps {
	readonly identity: EvidenceSourceIdentity;
	readonly children: ReactNode;
}

function EvidenceDialogLink({
	identity,
	children,
}: EvidenceDialogLinkProps): React.JSX.Element {
	const { open, clicked, onOpenChange } = useEvidenceOpening();
	const href = evidenceHref(identity);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogTrigger asChild>
				<a href={href} onClick={clicked}>
					{children}
				</a>
			</DialogTrigger>
			<DialogContent width="wide">
				<EvidenceDialogHeader identity={identity} href={href} />
				<EvidenceSourcePage identity={identity} embedded />
			</DialogContent>
		</Dialog>
	);
}

interface EvidenceDialogHeaderProps {
	readonly identity: EvidenceSourceIdentity;
	readonly href: string;
}

function EvidenceDialogHeader({
	identity,
	href,
}: EvidenceDialogHeaderProps): React.JSX.Element {
	const label =
		identity.kind === "stage"
			? `${identity.stage} Judge · ${identity.item}`
			: `Final Judge · ${identity.item}`;
	return (
		<div className="flex flex-none flex-wrap items-start justify-between gap-3 border-b border-divider px-6 py-4">
			<div className="min-w-0 wrap-anywhere">
				<DialogTitle>Cited source</DialogTitle>
				<DialogDescription>{label}</DialogDescription>
			</div>
			<ActionGroup>
				<Button asChild variant="quiet" size="compact">
					<Link to={href}>Open full page</Link>
				</Button>
				<DialogClose asChild>
					<Button variant="outline" size="compact">
						Close
					</Button>
				</DialogClose>
			</ActionGroup>
		</div>
	);
}

interface EvidenceOpening {
	readonly open: boolean;
	readonly clicked: (
		event: Readonly<
			Pick<
				MouseEvent<HTMLAnchorElement>,
				| "button"
				| "metaKey"
				| "ctrlKey"
				| "shiftKey"
				| "altKey"
				| "preventDefault"
			>
		>,
	) => void;
	readonly onOpenChange: (next: boolean) => void;
}

function useEvidenceOpening(): EvidenceOpening {
	const [open, setOpen] = useState(false);
	const suppressTriggerOpen = useRef(false);
	function clicked(
		event: Readonly<
			Pick<
				MouseEvent<HTMLAnchorElement>,
				| "button"
				| "metaKey"
				| "ctrlKey"
				| "shiftKey"
				| "altKey"
				| "preventDefault"
			>
		>,
	): void {
		if (
			event.button !== PRIMARY_POINTER_BUTTON ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		) {
			suppressTriggerOpen.current = true;
			return;
		}
		event.preventDefault();
		suppressTriggerOpen.current = false;
		setOpen(true);
	}
	return {
		clicked,
		onOpenChange: (next) => {
			if (!next || !suppressTriggerOpen.current) {
				setOpen(next);
			}
			suppressTriggerOpen.current = false;
		},
		open,
	};
}

export { EvidenceDialogLink as default };
