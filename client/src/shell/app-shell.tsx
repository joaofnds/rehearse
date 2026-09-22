import { Link, Outlet } from "@tanstack/react-router";
import { NAV_ITEMS } from "./nav-items";
import "./app-shell.css";

const ICON_SIZE = 15;

function NavEntry({
	label,
	icon,
	path,
}: {
	readonly label: string;
	readonly icon: React.ReactNode;
	readonly path: string | undefined;
}): React.JSX.Element {
	if (path === undefined) {
		return (
			<li className="rh-nav__item rh-nav__item--planned">
				{icon}
				<span className="rh-nav__label">{label}</span>
			</li>
		);
	}

	return (
		<li className="rh-nav__item">
			<Link to={path} className="rh-nav__link">
				{icon}
				<span className="rh-nav__label">{label}</span>
			</Link>
		</li>
	);
}

export function AppShell(): React.JSX.Element {
	return (
		<div className="rh-shell">
			<nav className="rh-nav" aria-label="Sections">
				<ul className="rh-nav__list">
					{NAV_ITEMS.map(({ label, icon: NavIcon, path }) => (
						<NavEntry
							key={label}
							label={label}
							icon={<NavIcon size={ICON_SIZE} aria-hidden />}
							path={path}
						/>
					))}
				</ul>
			</nav>

			<main className="rh-shell__main">
				<Outlet />
			</main>
		</div>
	);
}
