"""Console screenshots for the README. Needs the console preview on :4174 (cd web && npm run build && npm run preview).

python scripts/screenshots.py [--chrome /usr/bin/google-chrome]
"""

from __future__ import annotations

import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright

OUT = Path(__file__).parents[1] / "docs" / "screenshots"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--chrome", default="/usr/bin/google-chrome")
    ap.add_argument("--url", default="http://localhost:4174")
    a = ap.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=a.chrome)
        page = b.new_page(viewport={"width": 1440, "height": 1000}, reduced_motion="reduce")
        page.goto(f"{a.url}/#accounts", wait_until="networkidle")
        page.wait_for_selector(".acc-detail")
        page.wait_for_timeout(700)
        page.screenshot(path=str(OUT / "accounts.png"), full_page=True)
        page.click(".acc-row >> text=Arnold Drive Systems GmbH")
        page.wait_for_timeout(900)
        page.screenshot(path=str(OUT / "accounts-us.png"), full_page=True)
        for name in ("signals", "sync", "results"):
            page.goto(f"{a.url}/#{name}", wait_until="networkidle")
            page.wait_for_timeout(900)
            page.screenshot(path=str(OUT / f"{name}.png"), full_page=True)
        page.emulate_media(color_scheme="dark")
        page.goto(f"{a.url}/#accounts", wait_until="networkidle")
        page.wait_for_timeout(700)
        page.screenshot(path=str(OUT / "accounts-dark.png"))
        b.close()


if __name__ == "__main__":
    main()
