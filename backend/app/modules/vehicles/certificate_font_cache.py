from __future__ import annotations

import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import gettempdir
from urllib.request import Request, urlopen

FONT_CACHE_DIR = Path(gettempdir()) / "lite-vms-certificate-fonts"

DOWNLOADS = {
    "DMSans-ExtraBold.ttf": "https://raw.githubusercontent.com/googlefonts/dm-fonts/main/Sans/fonts/ttf/DMSans-ExtraBold.ttf",
    "DMSans-Regular.ttf": "https://raw.githubusercontent.com/googlefonts/dm-fonts/main/Sans/fonts/ttf/DMSans-Regular.ttf",
    "DMSans-Medium.ttf": "https://raw.githubusercontent.com/googlefonts/dm-fonts/main/Sans/fonts/ttf/DMSans-Medium.ttf",
    "Urbanist-Medium.ttf": "https://raw.githubusercontent.com/coreyhu/Urbanist/main/fonts/ttf/Urbanist-Medium.ttf",
    "Urbanist-Bold.ttf": "https://raw.githubusercontent.com/coreyhu/Urbanist/main/fonts/ttf/Urbanist-Bold.ttf",
    "AlumniSans-variable.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/alumnisans/AlumniSans%5Bwght%5D.ttf",
    "Inter-variable.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter%5Bopsz%2Cwght%5D.ttf",
    "Inter-Italic-variable.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/inter/Inter-Italic%5Bopsz%2Cwght%5D.ttf",
    "42dotSans-variable.ttf": "https://raw.githubusercontent.com/google/fonts/main/ofl/42dotsans/42dotSans%5Bwght%5D.ttf",
}


def _download(item: tuple[str, str]) -> None:
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


def _instantiate(source_name: str, output_name: str, axes: dict[str, float]) -> None:
    source = FONT_CACHE_DIR / source_name
    output = FONT_CACHE_DIR / output_name
    if output.exists() and output.stat().st_size > 1024:
        return
    if not source.exists():
        return
    try:
        from fontTools.ttLib import TTFont as FontToolsTTFont
        from fontTools.varLib.instancer import instantiateVariableFont

        font = FontToolsTTFont(str(source))
        static_font = instantiateVariableFont(font, axes, inplace=False)
        temporary = output.with_suffix(output.suffix + ".tmp")
        static_font.save(str(temporary))
        temporary.replace(output)
    except Exception:
        output.with_suffix(output.suffix + ".tmp").unlink(missing_ok=True)


def ensure_certificate_fonts() -> Path:
    """Cache the open-source fonts and exact weights used by the Figma certificate."""
    FONT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    if "pytest" in sys.modules:
        return FONT_CACHE_DIR

    missing = [item for item in DOWNLOADS.items() if not (FONT_CACHE_DIR / item[0]).exists()]
    if missing:
        with ThreadPoolExecutor(max_workers=min(6, len(missing))) as executor:
            list(executor.map(_download, missing))

    _instantiate("AlumniSans-variable.ttf", "AlumniSans.ttf", {"wght": 400})
    _instantiate("Inter-variable.ttf", "Inter.ttf", {"opsz": 14, "wght": 400})
    _instantiate("Inter-variable.ttf", "Inter-Medium.ttf", {"opsz": 14, "wght": 500})
    _instantiate("Inter-variable.ttf", "Inter-SemiBold.ttf", {"opsz": 14, "wght": 600})
    _instantiate("Inter-variable.ttf", "Inter-Bold.ttf", {"opsz": 14, "wght": 700})
    _instantiate("Inter-Italic-variable.ttf", "Inter-Italic.ttf", {"opsz": 14, "wght": 400})
    _instantiate("42dotSans-variable.ttf", "42dotSans.ttf", {"wght": 400})
    return FONT_CACHE_DIR
