#!/usr/bin/env python3
"""
Resolve shadcn registry items (style: new-york) and write files into the Vite frontend.
Rewrites @/registry/* imports to @/... paths used by this repo.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.request
from pathlib import Path

BASE = "https://ui.shadcn.com/r/styles/new-york"

# Default outbound proxy (override with HTTP_PROXY / HTTPS_PROXY).
DEFAULT_PROXY = "http://127.0.0.1:10808"


def install_proxy_opener() -> None:
    proxy = (
        os.environ.get("HTTPS_PROXY")
        or os.environ.get("HTTP_PROXY")
        or os.environ.get("ALL_PROXY")
        or DEFAULT_PROXY
    )
    handler = urllib.request.ProxyHandler({"http": proxy, "https": proxy})
    opener = urllib.request.build_opener(handler)
    urllib.request.install_opener(opener)
ROOT = Path(__file__).resolve().parents[1]
FE = ROOT / "frontend"
SRC = FE / "src"

BLOCK_PAGE_FILES = {
    "login-04": "LoginPage.tsx",
    "sidebar-07": "DashboardLayoutPage.tsx",
}


def fetch_item(name: str) -> dict:
    url = f"{BASE}/{name}.json"
    req = urllib.request.Request(url)
    with urllib.request.urlopen(req, timeout=90) as resp:  # noqa: S310
        return json.load(resp)


def map_target_path(registry_path: str) -> Path:
    if registry_path.startswith("ui/"):
        return SRC / "components" / registry_path
    if registry_path.startswith("lib/"):
        return SRC / registry_path
    if registry_path.startswith("hooks/"):
        return SRC / registry_path
    if registry_path.startswith("components/"):
        return SRC / registry_path

    m = re.match(r"^blocks/([^/]+)/components/(.+)$", registry_path)
    if m:
        block, rest = m.group(1), m.group(2)
        return SRC / "components" / block / rest

    m = re.match(r"^blocks/([^/]+)/page\.tsx$", registry_path)
    if m:
        block = m.group(1)
        filename = BLOCK_PAGE_FILES.get(block)
        if not filename:
            raise ValueError(f"Add BLOCK_PAGE_FILES entry for block: {block}")
        return SRC / "pages" / filename

    raise ValueError(f"Unmapped registry path: {registry_path}")


def rewrite_tsx(content: str) -> str:
    lines = content.splitlines()
    if lines and (
        lines[0].strip() == '"use client"' or lines[0].strip() == "'use client'"
    ):
        lines = lines[1:]
    content = "\n".join(lines).lstrip("\n")
    content = content.replace("@/registry/new-york/", "@/")
    content = content.replace("@/registry/default/", "@/")
    content = content.replace("@/ui/", "@/components/ui/")
    return content


def collect(start: list[str]) -> tuple[dict[str, str], set[str]]:
    """Returns rel_path -> content, and npm package dependencies."""
    seen: set[str] = set()
    queue: list[str] = list(start)
    files: dict[str, str] = {}
    npm_deps: set[str] = set()

    while queue:
        name = queue.pop(0)
        if name in seen:
            continue
        seen.add(name)
        item = fetch_item(name)
        for dep in item.get("registryDependencies") or []:
            if dep not in seen:
                queue.append(dep)
        for dep in item.get("dependencies") or []:
            npm_deps.add(dep)
        for f in item.get("files") or []:
            path = f["path"]
            content = rewrite_tsx(f["content"])
            files[path] = content
    return files, npm_deps


def main() -> int:
    install_proxy_opener()
    items = sys.argv[1:] or ["login-04", "sidebar-07"]
    files, npm_deps = collect(items)
    written = 0
    for reg_path, content in sorted(files.items()):
        out = map_target_path(reg_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(content + ("\n" if not content.endswith("\n") else ""), encoding="utf-8")
        written += 1
    print(f"Wrote {written} files from registry items: {', '.join(items)}")
    if npm_deps:
        print("Also install npm deps:")
        print("  npm install " + " ".join(sorted(npm_deps)))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
