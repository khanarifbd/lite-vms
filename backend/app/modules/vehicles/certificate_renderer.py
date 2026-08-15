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
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from app.core.config import settings

if TYPE_CHECKING:
    from app.modules.owners.model import VehicleOwner
    from app.modules.vehicles.model import Vehicle


FIGMA_WIDTH = 1362.0
FIGMA_HEIGHT = 1920.0
CERTIFICATE_ASSET_DIR = Path(__file__).resolve().parents[2] / "assets" / "certificate_template"
TEXT_COLOR = colors.HexColor("#231f20")
SECONDARY_TEXT = colors.Color(35 / 255, 31 / 255, 32 / 255, alpha=0.70)
ROW_TEXT = colors.HexColor("#505958")
ACTIVE_GREEN = colors.HexColor("#008200")
CARD_BORDER = colors.Color(225 / 255, 0, 0, alpha=0.30)
BTRC_BORDER = colors.Color(225 / 255, 0, 0, alpha=0.06)


def _owner_name(vehicle: Vehicle, owner: VehicleOwner) -> str:
    registered_owner_name = (vehicle.registered_owner_name or "").strip()
    return registered_owner_name or owner.name or "Not recorded"


def _fitted_font_size(
    text: str,
    *,
    font_name: str,
    maximum_size: float,
    minimum_size: float,
    maximum_width: float,
) -> float:
    font_size = maximum_size
    while font_size > minimum_size and stringWidth(text, font_name, font_size) > maximum_width:
        font_size = max(minimum_size, font_size - 0.25)
    return font_size


def _wrapped_text_lines(
    text: str,
    *,
    font_name: str,
    font_size: float,
    maximum_width: float,
) -> list[str]:
    words = text.split()
    if not words:
        return []
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if stringWidth(candidate, font_name, font_size) <= maximum_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def render_certificate_pdf(
    vehicle: Vehicle,
    owner: VehicleOwner,
    provider_legal_name: str,
) -> BytesIO:
    """Render the production certificate using the Figma `Certificate GO max_final` layout."""
    if not vehicle.certificate_number or not vehicle.certificate_issued_at or not vehicle.certificate_expires_at:
        raise ValueError("Certificate has not been issued")

    output = BytesIO()
    page = canvas.Canvas(output, pagesize=A4)
    width, height = A4
    scale = width / FIGMA_WIDTH

    def x(value: float) -> float:
        return value * scale

    def y(value: float) -> float:
        return height - value * scale

    def date_text(value: date | None, *, uppercase: bool = False) -> str:
        if value is None:
            return "Not recorded"
        rendered = f"{value.day} {value.strftime('%B %Y')}"
        return rendered.upper() if uppercase else rendered

    def draw_asset(name: str, left: float, top: float, asset_width: float, asset_height: float) -> None:
        path = CERTIFICATE_ASSET_DIR / name
        if path.exists():
            page.drawImage(
                ImageReader(path),
                x(left),
                y(top + asset_height),
                x(asset_width),
                x(asset_height),
                mask="auto",
            )

    def draw_condensed_centered(
        text: str,
        *,
        center_x: float,
        baseline: float,
        font_size: float,
        horizontal_scale: float = 70,
    ) -> None:
        pdf_size = x(font_size)
        text_width = stringWidth(text, "Helvetica", pdf_size) * horizontal_scale / 100
        text_object = page.beginText()
        text_object.setTextOrigin(x(center_x) - text_width / 2, y(baseline))
        text_object.setFont("Helvetica", pdf_size)
        text_object.setHorizScale(horizontal_scale)
        text_object.textOut(text)
        page.drawText(text_object)

    def draw_card(
        left: float,
        title: str,
        rows: list[tuple[str, str, colors.Color, bool]],
    ) -> None:
        top = 859.0
        card_width = 560.0
        card_height = 329.0
        page.setStrokeColor(CARD_BORDER)
        page.setLineWidth(x(1))
        page.roundRect(
            x(left),
            y(top + card_height),
            x(card_width),
            x(card_height),
            x(12),
            stroke=1,
            fill=0,
        )
        page.setFillColor(TEXT_COLOR)
        page.setFont("Helvetica-Bold", x(24))
        page.drawString(x(left + 20), y(top + 41), title)

        row_top = top + 65
        row_height = 48
        for index, (label, value, value_color, show_status_dot) in enumerate(rows):
            current_top = row_top + index * 49
            page.setFillColor(colors.white)
            page.roundRect(
                x(left + 20),
                y(current_top + row_height),
                x(card_width - 40),
                x(row_height),
                x(4),
                stroke=0,
                fill=1,
            )
            page.setFillColor(ROW_TEXT)
            page.setFont("Helvetica", x(16))
            page.drawString(x(left + 44), y(current_top + 31), label)

            value_right = left + card_width - 44
            value_max_width = card_width - 250
            value_size = _fitted_font_size(
                value,
                font_name="Helvetica-Bold",
                maximum_size=x(16),
                minimum_size=x(9),
                maximum_width=x(value_max_width),
            )
            page.setFillColor(value_color)
            page.setFont("Helvetica-Bold", value_size)
            page.drawRightString(x(value_right), y(current_top + 31), value)
            if show_status_dot:
                value_width = stringWidth(value, "Helvetica-Bold", value_size)
                dot_x = x(value_right) - value_width - x(14)
                dot_y = y(current_top + 27)
                page.setStrokeColor(ACTIVE_GREEN)
                page.setFillColor(colors.Color(0, 130 / 255, 0, alpha=0.08))
                page.circle(dot_x, dot_y, x(5.2), stroke=1, fill=1)
                page.setFillColor(ACTIVE_GREEN)
                page.circle(dot_x, dot_y, x(2.7), stroke=0, fill=1)

    # Background and printed frame use the exact 1362x1920 Figma coordinate system.
    page.setFillColor(colors.HexColor("#fdf9f5"))
    page.rect(0, 0, width, height, stroke=0, fill=1)
    draw_asset("pattern.png", -671, 0, 2705, FIGMA_HEIGHT)
    draw_asset("border.png", 21, 0, 1319.38, FIGMA_HEIGHT)
    draw_asset("background_mark.png", 210, 568, 943, 301.653)

    # Brand marks.
    draw_asset("gomax_tracker.png", 110.07, 30, 238.47, 100)
    draw_asset("auto_generation.png", 936.45, 30, 315.47, 100)

    # Header.
    page.setFillColor(TEXT_COLOR)
    page.setFont("Helvetica-Bold", x(38))
    page.drawCentredString(width / 2, y(224), "AUTO GENERATION LIMITED")
    draw_condensed_centered(
        "GPS TRACKER COMPLIANCE",
        center_x=681,
        baseline=338,
        font_size=96,
        horizontal_scale=68,
    )
    draw_condensed_centered(
        "CERTIFICATE",
        center_x=681,
        baseline=419,
        font_size=96,
        horizontal_scale=68,
    )

    # Certificate number chip.
    page.setFillColor(colors.HexColor("#f5eee7"))
    page.setStrokeColor(colors.HexColor("#e1b68d"))
    page.setLineWidth(x(1))
    page.roundRect(x(383.5), y(527), x(595), x(62), x(12), stroke=1, fill=1)
    page.setFillColor(TEXT_COLOR)
    certificate_label = f"GPS Certificate No: {vehicle.certificate_number}"
    certificate_size = _fitted_font_size(
        certificate_label,
        font_name="Helvetica-Bold",
        maximum_size=x(26),
        minimum_size=x(14),
        maximum_width=x(535),
    )
    page.setFont("Helvetica-Bold", certificate_size)
    page.drawCentredString(width / 2, y(505), certificate_label)

    # Verification QR.
    verification_url = (
        f"{settings.public_web_url.rstrip('/')}/verify/certificate/"
        f"{quote(vehicle.certificate_number, safe='')}"
    )
    qr_output = BytesIO()
    qrcode.make(verification_url).save(qr_output, format="PNG")
    qr_output.seek(0)
    page.drawImage(
        ImageReader(qr_output),
        x(1048),
        y(201.6 + 240),
        x(240),
        x(240),
        mask="auto",
    )
    page.setFillColor(colors.HexColor("#1e1e1e"))
    page.setFont("Helvetica-Bold", x(24))
    page.drawCentredString(x(1168), y(476), "Scan to Verify")

    # Explanatory copy. Keep the issuing VTS legal company dynamic while matching Figma geometry.
    legal_name = provider_legal_name.strip() or "VTS Provider"
    statement_paragraphs = [
        (
            "This is to clarify that the vehicle described below has been equipped with genuine, "
            f"active and fully operational GPS tracking device installed by {legal_name}, a BTRC "
            "Licensed Vehicle Tracking Service (VTS) Provider."
        ),
        (
            "The certificate confirms that the installed GPS tracking device is functional and has been "
            "installed in accordance with applicable GPS tracking requirements and relevant directives "
            "issued by the Bangladesh Road Transport Authority (BRTA), where applicable."
        ),
    ]
    page.setFillColor(SECONDARY_TEXT)
    statement_font = x(24)
    page.setFont("Helvetica", statement_font)
    statement_lines: list[str] = []
    for paragraph in statement_paragraphs:
        if statement_lines:
            statement_lines.append("")
        statement_lines.extend(
            _wrapped_text_lines(
                paragraph,
                font_name="Helvetica",
                font_size=statement_font,
                maximum_width=x(1120),
            )
        )
    for index, line in enumerate(statement_lines):
        page.drawCentredString(width / 2, y(592 + index * 36), line)

    # Figma cards: exactly five compact rows on each side.
    normal = TEXT_COLOR
    vehicle_rows = [
        ("Owner Name:", _owner_name(vehicle, owner), normal, False),
        ("Registration No:", vehicle.registration_number_display or vehicle.registration_number, normal, False),
        ("Vehicle Type:", vehicle.vehicle_type or "Not recorded", normal, False),
        ("Engine NO:", vehicle.engine_number or "Not recorded", normal, False),
        ("Chassis No:", vehicle.chassis_number or "Not recorded", normal, False),
    ]
    validity_rows = [
        ("Date of Issue:", date_text(vehicle.certificate_issued_at), normal, False),
        ("Valid Until:", date_text(vehicle.certificate_expires_at, uppercase=True), normal, False),
        ("VTS Installation Date:", date_text(vehicle.vts_installation_date), normal, False),
        ("Current Status", "Active", ACTIVE_GREEN, True),
        ("GPS Status", "Connected", ACTIVE_GREEN, True),
    ]
    draw_card(101, "VEHICLE PARTICULARS", vehicle_rows)
    draw_card(701, "VALIDITY INFORMATION", validity_rows)

    # BTRC licence strip.
    page.setFillColor(colors.white)
    page.setStrokeColor(BTRC_BORDER)
    page.setLineWidth(x(1))
    page.roundRect(x(101), y(1418), x(1160), x(170), x(12), stroke=1, fill=1)
    draw_asset("btrc_1.png", 131, 1308.37, 130, 89.63)
    draw_asset("btrc_2.png", 158.47, 1268, 72.47, 23.02)
    draw_asset("btrc_3.png", 150.63, 1285.22, 89.81, 92.94)
    draw_asset("btrc_4.png", 161.62, 1322.83, 68.78, 22.78)
    draw_asset("btrc_bangla_title.png", 309, 1282, 905, 38)
    page.setFillColor(SECONDARY_TEXT)
    page.setFont("Helvetica", x(26))
    page.drawString(x(309), y(1361), "BTRC VTS License No:")
    page.setFillColor(TEXT_COLOR)
    page.setFont("Helvetica-Bold", x(26))
    page.drawString(x(575), y(1361), "14.32.00000.007.58.055.18.44")

    # Footer information.
    page.setFillColor(TEXT_COLOR)
    page.setFont("Helvetica-Bold", x(24))
    page.drawString(x(101), y(1527), "IMPORTANT NOTICE")
    page.drawString(x(544), y(1527), "CONTACT INFO")

    page.setFont("Helvetica", x(18))
    notice_lines = [
        (101, 1566, "• This certificate is valid only while the GPS"),
        (118, 1591, "subscription remains active."),
        (101, 1633, "• Misuse of this certificate is an offence under"),
        (118, 1658, "Bangladesh ICT Act, 2006."),
    ]
    for left, baseline, line in notice_lines:
        page.drawString(x(left), y(baseline), line)

    contact_lines = [
        "Call Center (24/7): +880 9666 766 766",
        "Any Query: +8801977-000601",
        "Email: support@gomaxtracker.com",
        "Website: www.gomaxtracker.com",
        "Dhaka Office: House# 646 (4th floor), Road # 9 (Main road)",
        "Mirpur DOHS. Dhaka-1216 Bangladesh",
        "Chattogram Office: House#1029-Sufea Monjil (Bata Goli),",
        "GEC, Chittagong Bangladesh",
    ]
    page.setFont("Helvetica", x(18))
    for index, line in enumerate(contact_lines):
        page.drawString(x(544), y(1566 + index * 24), line)

    draw_asset("brta_emblem.png", 1076, 1498, 170, 170)
    page.setFont("Helvetica", x(20))
    page.drawCentredString(x(1161), y(1703), "BRTA Approved")

    page.setFillColor(SECONDARY_TEXT)
    page.setFont("Helvetica-Oblique", x(18))
    page.drawCentredString(
        width / 2,
        y(1860),
        "This is a system generated certificate and requires no manual signature.",
    )
    page.drawCentredString(width / 2, y(1886), "Powered by Auto Generation Limited.")

    page.showPage()
    page.save()
    output.seek(0)
    return output
