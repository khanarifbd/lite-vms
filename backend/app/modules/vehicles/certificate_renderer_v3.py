from __future__ import annotations

from datetime import date
from io import BytesIO
from pathlib import Path
from typing import TYPE_CHECKING
from urllib.parse import quote

import qrcode
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfgen import canvas

from app.core.config import settings

if TYPE_CHECKING:
    from app.modules.owners.model import VehicleOwner
    from app.modules.vehicles.model import Vehicle


FIGMA_WIDTH = 1362.0
ASSET_DIR = Path(__file__).resolve().parents[2] / "assets" / "certificate_template"
MASTER_TEMPLATE = ASSET_DIR / "figma_certificate_master.png"
TEXT = colors.HexColor("#231f20")
ROW_TEXT = colors.HexColor("#505958")
GREEN = colors.HexColor("#008200")


def _owner_name(vehicle: Vehicle, owner: VehicleOwner) -> str:
    return (vehicle.registered_owner_name or "").strip() or owner.name or "Not recorded"


def render_certificate_pdf(vehicle: Vehicle, owner: VehicleOwner, provider_legal_name: str) -> BytesIO:
    """Render Figma frame 47:32 and overlay only certificate-specific data."""
    if not vehicle.certificate_number or not vehicle.certificate_issued_at or not vehicle.certificate_expires_at:
        raise ValueError("Certificate has not been issued")
    if not MASTER_TEMPLATE.exists():
        raise FileNotFoundError(f"Missing certificate master template: {MASTER_TEMPLATE}")

    output = BytesIO()
    page = canvas.Canvas(output, pagesize=A4)
    page_width, page_height = A4
    scale = page_width / FIGMA_WIDTH

    def x(value: float) -> float:
        return value * scale

    def y(value: float) -> float:
        return page_height - value * scale

    def clear(left: float, top: float, box_width: float, box_height: float, fill=colors.white) -> None:
        page.setFillColor(fill)
        page.rect(x(left), y(top + box_height), x(box_width), x(box_height), stroke=0, fill=1)

    def date_text(value: date | None, *, upper: bool = False, leading_zero: bool = False) -> str:
        if value is None:
            return "Not recorded"
        day = f"{value.day:02d}" if leading_zero else str(value.day)
        result = f"{day} {value.strftime('%B %Y')}"
        return result.upper() if upper else result

    def value(text: str, *, right: float, baseline: float, max_width: float, fill=ROW_TEXT) -> None:
        font = "Helvetica-Bold"
        size = x(16)
        while size > x(9) and pdfmetrics.stringWidth(text, font, size) > x(max_width):
            size -= 0.1
        page.setFont(font, size)
        page.setFillColor(fill)
        page.drawRightString(x(right), y(baseline), text)

    # The master preserves the exact Figma artwork: watermark, typography,
    # provider artwork, Bengali heading, borders, and footer spacing.
    page.drawImage(ImageReader(MASTER_TEMPLATE), 0, 0, page_width, page_height, mask="auto")

    # Certificate number replaces the design-time sample value.
    chip_left, chip_top, chip_width, chip_height = 383, 465, 596, 62
    page.setFillColor(colors.HexColor("#f5eee7"))
    page.setStrokeColor(colors.HexColor("#e1b68d"))
    page.setLineWidth(x(1))
    page.roundRect(x(chip_left), y(chip_top + chip_height), x(chip_width), x(chip_height), x(12), stroke=1, fill=1)
    chip_text = f"GPS Certificate No: {vehicle.certificate_number}"
    chip_size = x(26)
    while chip_size > x(13) and pdfmetrics.stringWidth(chip_text, "Helvetica-Bold", chip_size) > x(chip_width - 44):
        chip_size -= 0.1
    page.setFont("Helvetica-Bold", chip_size)
    page.setFillColor(TEXT)
    page.drawCentredString(x(681), y(506), chip_text)

    # Every certificate gets a QR link to its public verification endpoint.
    clear(1048, 202, 240, 240)
    verification_url = f"{settings.public_web_url.rstrip('/')}/verify/certificate/{quote(vehicle.certificate_number, safe='')}"
    qr_output = BytesIO()
    qrcode.make(verification_url).save(qr_output, format="PNG")
    qr_output.seek(0)
    page.drawImage(ImageReader(qr_output), x(1048), y(442), x(240), x(240), mask="auto")

    # Keep Figma labels and row artwork intact; replace only data values.
    rows = [924 + index * 49 for index in range(5)]
    for row_top in rows:
        clear(350, row_top, 291, 48)
        clear(980, row_top, 261, 48)

    left_values = (
        _owner_name(vehicle, owner),
        (vehicle.registration_number_display or vehicle.registration_number).upper(),
        vehicle.vehicle_type or "Not recorded",
        vehicle.engine_number or "Not recorded",
        vehicle.chassis_number or "Not recorded",
    )
    for index, item in enumerate(left_values):
        value(item, right=617, baseline=955 + index * 49, max_width=255)

    right_values = (
        date_text(vehicle.certificate_issued_at),
        date_text(vehicle.certificate_expires_at, upper=True),
        date_text(vehicle.vts_installation_date, leading_zero=True),
        "Active",
        "Connected",
    )
    for index, item in enumerate(right_values):
        value(item, right=1217, baseline=955 + index * 49, max_width=220, fill=GREEN if index == 3 else ROW_TEXT)
        if index >= 3:
            font_size = x(16)
            dot_x = x(1217) - pdfmetrics.stringWidth(item, "Helvetica-Bold", font_size) - x(20)
            dot_y = y(955 + index * 49 - 4)
            page.setStrokeColor(GREEN)
            page.setFillColor(colors.white)
            page.circle(dot_x, dot_y, x(6.5), stroke=1, fill=1)
            page.setFillColor(GREEN)
            page.circle(dot_x, dot_y, x(3.5), stroke=0, fill=1)

    page.showPage()
    page.save()
    output.seek(0)
    return output
