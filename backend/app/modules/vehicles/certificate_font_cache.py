from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import gettempdir
from urllib.request import Request, urlopen

FONT_CACHE_DIR = Path(gettempdir()) / "lite-vms-certificate-fonts"

FONT_URLS = {
    "DMSans-ExtraBold.ttf": "https://raw.githubusercontent.com/googlefonts/dm-fonts/main/Sans/fonts/ttf/DMSans-ExtraBold.ttf",
    "DMSans-Regular.ttf": "https://raw.githubusercontent.com/googlefonts/dm-fonts/main/Sans/fonts/ttf/DMSans-Regular.ttf",
    "DMSans-Medium.ttf": "https://raw.githubusercontent.com/googlefonts/dm-fonts/main/Sans/fonts/ttf/DMSans-Medium.ttf",
    "AlumniSans.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/alumnisans/AlumniSans%5Bwght%5D.ttf",
    "Inter.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf",
    "Inter-Italic.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter-Italic%5Bopsz%2Cwght%5D.ttf",
    "Urbanist-Medium.ttf": "https://raw.githubusercontent.com/coreyhu/Urbanist/main/fonts/ttf/Urbanist-Medium.ttf",
    "Urbanist-Bold.ttf": "https://raw.githubusercontent.com/coreyhu/Urbanist/main/fonts/ttf/Urbanist-Bold.ttf",
    "42dotSans.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/42dotsans/42dotSans%5Bwght%5D.ttf",
}


def _download_font(item: tuple[str, str]) -> None:
    filename, url = item
    destination = FONT_CACHE_DIR / filename
    if destination.exists() and destination.stat().st_size > 1024:
        return
    temporary = destination.with_suffix(destination.suffix + ".tmp")
    try:
        request = Request(url, headers={"User-Agent": "lite-vms-certificate-renderer"})
        with urlopen(request, timeout=12) as response:
            data = response.read()
        if len(data) <= 1024:
            return
        temporary.write_bytes(data)
        temporary.replace(destination)
    except Exception:
        temporary.unlink(missing_ok=True)


def ensure_certificate_fonts() -> Path:
    """Best-effort cache of the open-source fonts used by the Figma certificate."""
    FONT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if "pytest" in sys.modules:
        return FONT_CACHE_DIR
    missing = [item for item in FONT_URLS.items() if not (FONT_CACHE_DIR / item[0]).exists()]
    if missing:
        with ThreadPoolExecutor(max_workers=min(6, len(missing))) as executor:
            list(executor.map(_download_font, missing))
    return FONT_CACHE_DIR
