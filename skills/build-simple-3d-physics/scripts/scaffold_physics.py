#!/usr/bin/env python3
"""Copy the lightweight TypeScript physics templates into a target project."""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--target",
        required=True,
        type=Path,
        help="Destination directory, normally <project>/src/physics",
    )
    parser.add_argument(
        "--adapter",
        choices=("three", "none"),
        default="three",
        help="Copy the Three.js adapter or only the renderer-neutral engine",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite destination files that already exist",
    )
    return parser.parse_args()


def copy_file(source: Path, destination: Path, force: bool) -> None:
    if destination.exists() and not force:
        raise FileExistsError(f"Refusing to overwrite {destination}; pass --force to replace it")
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)
    print(f"Copied {destination}")


def main() -> None:
    args = parse_args()
    skill_dir = Path(__file__).resolve().parents[1]
    template_dir = skill_dir / "assets" / "typescript"
    files = ["simple-physics.ts"]
    if args.adapter == "three":
        files.append("threejs-adapter.ts")

    copy_plan: list[tuple[Path, Path]] = []
    for filename in files:
        source = template_dir / filename
        if not source.is_file():
            raise FileNotFoundError(f"Missing bundled template: {source}")
        copy_plan.append((source, args.target.resolve() / filename))

    conflicts = [destination for _, destination in copy_plan if destination.exists()]
    if conflicts and not args.force:
        conflict_list = "\n".join(f"- {path}" for path in conflicts)
        raise SystemExit(
            "Refusing to overwrite existing files; pass --force to replace them:\n"
            f"{conflict_list}"
        )

    for source, destination in copy_plan:
        copy_file(source, destination, args.force)


if __name__ == "__main__":
    main()
