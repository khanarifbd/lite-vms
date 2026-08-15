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


def _scaled_width(text: str, font_name: str, font_size: float, horizontal_scale: float = 100) -> float:
    return stringWidth(text, font_name, font_size) * horizontal_scale / 100


def _fitted_font_size(
    text: str,
    *,
    font_name: str,
    maximum_size: float,
    minimum_size: float,
    maximum_width: float,
    horizontal_scale: float = 100,
) -> float:
    font_size = maximum_size
    while (
        font_size > minimum_size
        and _scaled_width(text, font_name, font_size, horizontal_scale) > maximum_width
    ):
        font_size = max(minimum_size, font_size - 0.25)
    return font_size


def _wrapped_text_lines(
    text: str,
    *,
    font_name: str,
    font_size: float,
    maximum_width: float,
    horizontal_scale: float = 100,
) -> list[str]:
    words = text.split()
    if not words:
        return []
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if _scaled_width(candidate, font_name, font_size, horizontal_scale) <= maximum_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def _is_gomax_provider(provider_legal_name: str) -> bool:
    compact = provider_legal_name.lower().replace(" ", "")
    return "gomax" in compact or "autogeneration" in compact


def render_certificate_pdf(
    vehicle: Vehicle,
    owner: VehicleOwner,
    provider_legal_name: str,
) -> BytesIO:
    """Render a data-driven A4 certificate aligned to Figma frame 47:32."""
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

    def draw_scaled_text(
        text: str,
        *,
        anchor_x: float,
        baseline: float,
        font_name: str,
        font_size: float,
        horizontal_scale: float = 100,
        align: str = "left",
        fill=TEXT_COLOR,
    ) -> None:
        pdf_size = x(font_size)
        text_width = _scaled_width(text, font_name, pdf_size, horizontal_scale)
        origin_x = x(anchor_x)
        if align == "center":
            origin_x -= text_width / 2
        elif align == "right":
            origin_x -= text_width
        text_object = page.beginText()
        text_object.setTextOrigin(origin_x, y(baseline))
        text_object.setFont(font_name, pdf_size)
        text_object.setHorizScale(horizontal_scale)
        text_object.setFillColor(fill)
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
            x(left), y(top + card_height), x(card_width), x(card_height), x(12), stroke=1, fill=0
        )

        draw_scaled_text(
            title,
            anchor_x=left + 20,
            baseline=902,
            font_name="Helvetica-Bold",
            font_size=24,
            horizontal_scale=95,
        )

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

            draw_scaled_text(
                label,
                anchor_x=left + 44,
                baseline=current_top + 31,
                font_name="Helvetica",
                font_size=17,
                horizontal_scale=108,
                fill=ROW_TEXT,
            )

            value_right = left + card_width - 44
            value_scale = 104
            value_size = _fitted_font_size(
                value,
                font_name="Helvetica-Bold",
                maximum_size=x(17),
                minimum_size=x(9.5),
                maximum_width=x(card_width - 250),
                horizontal_scale=value_scale,
            )
            value_width = _scaled_width(value, "Helvetica-Bold", value_size, value_scale)
            text_object = page.beginText()
            text_object.setTextOrigin(x(value_right) - value_width, y(current_top + 31))
            text_object.setFont("Helvetica-Bold", value_size)
            text_object.setHorizScale(value_scale)
            text_object.setFillColor(value_color)
            text_object.textOut(value)
            page.drawText(text_object)

            if show_status_dot:
                dot_x = x(value_right) - value_width - x(14)
                dot_y = y(current_top + 27)
                page.setStrokeColor(ACTIVE_GREEN)
                page.setFillColor(colors.Color(0, 130 / 255, 0, alpha=0.08))
                page.circle(dot_x, dot_y, x(5.2), stroke=1, fill=1)
                page.setFillColor(ACTIVE_GREEN)
                page.circle(dot_x, dot_y, x(2.7), stroke=0, fill=1)

    page.setFillColor(colors.HexColor("#fdf9f5"))
    page.rect(0, 0, width, height, stroke=0, fill=1)
    draw_asset("pattern.png", -671, 0, 2705, FIGMA_HEIGHT)
    draw_asset("border.png", 21, 0, 1319.38, FIGMA_HEIGHT)
    draw_asset("background_mark.png", 210, 568, 943, 301.653)

    draw_asset("gomax_tracker.png", 110.07, 30, 238.47, 100)
    draw_asset("auto_generation.png", 936.45, 30, 315.47, 100)

    # Figma: DM Sans ExtraBold + Alumni Sans. Helvetica is reshaped horizontally so
    # its printed footprint matches the design without introducing a server font dependency.
    draw_scaled_text(
        "AUTO GENERATION LIMITED",
        anchor_x=681,
        baseline=224,
        font_name="Helvetica-Bold",
        font_size=38,
        horizontal_scale=91,
        align="center",
    )
    draw_scaled_text(
        "GPS TRACKER COMPLIANCE",
        anchor_x=681,
        baseline=338,
        font_name="Helvetica",
        font_size=96,
        horizontal_scale=57,
        align="center",
    )
    draw_scaled_text(
        "CERTIFICATE",
        anchor_x=681,
        baseline=419,
        font_name="Helvetica",
        font_size=96,
        horizontal_scale=57,
        align="center",
    )

    page.setFillColor(colors.HexColor("#f5eee7"))
    page.setStrokeColor(colors.HexColor("#e1b68d"))
    page.setLineWidth(x(1))
    page.roundRect(x(383.5), y(527), x(595), x(62), x(12), stroke=1, fill=1)
    certificate_label = f"GPS Certificate No: {vehicle.certificate_number}"
    certificate_size = _fitted_font_size(
        certificate_label,
        font_name="Helvetica-Bold",
        maximum_size=x(27),
        minimum_size=x(14),
        maximum_width=x(535),
        horizontal_scale=102,
    )
    certificate_width = _scaled_width(certificate_label, "Helvetica-Bold", certificate_size, 102)
    chip_text = page.beginText()
    chip_text.setTextOrigin(width / 2 - certificate_width / 2, y(505))
    chip_text.setFont("Helvetica-Bold", certificate_size)
    chip_text.setHorizScale(102)
    chip_text.setFillColor(TEXT_COLOR)
    chip_text.textOut(certificate_label)
    page.drawText(chip_text)

    verification_url = (
        f"{settings.public_web_url.rstrip('/')}/verify/certificate/"
        f"{quote(vehicle.certificate_number, safe='')}"
    )
    qr_output = BytesIO()
    qrcode.make(verification_url).save(qr_output, format="PNG")
    qr_output.seek(0)
    page.drawImage(ImageReader(qr_output), x(1048), y(441.6), x(240), x(240), mask="auto")
    draw_scaled_text(
        "Scan to Verify",
        anchor_x=1168,
        baseline=476,
        font_name="Helvetica",
        font_size=24,
        align="center",
        fill=colors.HexColor("#1e1e1e"),
    )

    # Go Max uses the exact Figma certificate copy and line breaks. Other providers retain
    # a provider-aware fallback so the shared certificate engine remains reusable.
    if _is_gomax_provider(provider_legal_name):
        statement_lines = [
            "This is to clarify that the vehicle described below has been equipped with genuine, active and",
            "fully operational GPS tracking device installed by Go Max Tracker, a product of Auto generation Limited,",
            "a BTRC Licensed Vehicle Tracking Service (VTS) Provider.",
            "",
            "The certificate confirms that the installed GPS tracking device is functional and has been",
            "installed in accordance with applicable GPS tracking requirements and relevant directives issued",
            "by the Bangladesh Road Transport Authority (BRTA), where applicable.",
        ]
        statement_scale = 104
    else:
        legal_name = provider_legal_name.strip() or "VTS Provider"
        statement_paragraphs = [
            (
                "This is to clarify that the vehicle described below has been equipped with genuine, active "
                f"and fully operational GPS tracking device installed by {legal_name}, a BTRC Licensed "
                "Vehicle Tracking Service (VTS) Provider."
            ),
            (
                "The certificate confirms that the installed GPS tracking device is functional and has been "
                "installed in accordance with applicable GPS tracking requirements and relevant directives "
                "issued by the Bangladesh Road Transport Authority (BRTA), where applicable."
            ),
        ]
        statement_font_for_wrap = x(24)
        statement_scale = 108
        statement_lines = []
        for paragraph in statement_paragraphs:
            if statement_lines:
                statement_lines.append("")
            statement_lines.extend(
                _wrapped_text_lines(
                    paragraph,
                    font_name="Helvetica",
                    font_size=statement_font_for_wrap,
                    maximum_width=x(1160),
                    horizontal_scale=statement_scale,
                )
            )

    statement_font = x(24)
    for index, line in enumerate(statement_lines):
        line_width = _scaled_width(line, "Helvetica", statement_font, statement_scale)
        text_object = page.beginText()
        text_object.setTextOrigin(width / 2 - line_width / 2, y(592 + index * 36))
        text_object.setFont("Helvetica", statement_font)
        text_object.setHorizScale(statement_scale)
        text_object.setFillColor(SECONDARY_TEXT)
        text_object.textOut(line)
        page.drawText(text_object)

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

    page.setFillColor(colors.white)
    page.setStrokeColor(BTRC_BORDER)
    page.setLineWidth(x(1))
    page.roundRect(x(101), y(1418), x(1160), x(170), x(12), stroke=1, fill=1)

    logo_scale = 0.90
    draw_asset("btrc_1.png", 141, 1312, 130 * logo_scale, 89.63 * logo_scale)
    draw_asset("btrc_2.png", 165.7, 1276, 72.47 * logo_scale, 23.02 * logo_scale)
    draw_asset("btrc_3.png", 158.6, 1291.5, 89.81 * logo_scale, 92.94 * logo_scale)
    draw_asset("btrc_4.png", 168.5, 1325.3, 68.78 * logo_scale, 22.78 * logo_scale)

    draw_asset("btrc_bangla_title.png", 309, 1290, 760, 32)
    draw_scaled_text(
        "BTRC VTS License No:",
        anchor_x=309,
        baseline=1361,
        font_name="Helvetica",
        font_size=26,
        horizontal_scale=108,
        fill=SECONDARY_TEXT,
    )
    draw_scaled_text(
        "14.32.00000.007.58.055.18.44",
        anchor_x=586,
        baseline=1361,
        font_name="Helvetica-Bold",
        font_size=26,
        horizontal_scale=103,
    )

    draw_scaled_text(
        "IMPORTANT NOTICE",
        anchor_x=101,
        baseline=1527,
        font_name="Helvetica-Bold",
        font_size=24,
        horizontal_scale=96,
    )
    draw_scaled_text(
        "CONTACT INFO",
        anchor_x=544,
        baseline=1527,
        font_name="Helvetica-Bold",
        font_size=24,
        horizontal_scale=96,
    )

    notice_lines = [
        (101, 1566, "• This certificate is valid only while the GPS"),
        (118, 1593, "subscription remains active."),
        (101, 1635, "• Misuse of this certificate is an offence under"),
        (118, 1662, "Bangladesh ICT Act, 2006."),
    ]
    for left, baseline, line in notice_lines:
        draw_scaled_text(
            line,
            anchor_x=left,
            baseline=baseline,
            font_name="Helvetica",
            font_size=19,
            horizontal_scale=108,
        )

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
    for index, line in enumerate(contact_lines):
        draw_scaled_text(
            line,
            anchor_x=544,
            baseline=1566 + index * 25,
            font_name="Helvetica",
            font_size=19,
            horizontal_scale=105,
        )

    draw_asset("brta_emblem.png", 1080, 1502, 162, 162)
    draw_scaled_text(
        "BRTA Approved",
        anchor_x=1161,
        baseline=1703,
        font_name="Helvetica",
        font_size=20,
        align="center",
    )

    draw_scaled_text(
        "This is a system generated certificate and requires no manual signature.",
        anchor_x=681,
        baseline=1860,
        font_name="Helvetica-Oblique",
        font_size=18,
        horizontal_scale=110,
        align="center",
        fill=SECONDARY_TEXT,
    )
    draw_scaled_text(
        "Powered by Auto Generation Limited.",
        anchor_x=681,
        baseline=1886,
        font_name="Helvetica-Oblique",
        font_size=18,
        horizontal_scale=110,
        align="center",
        fill=SECONDARY_TEXT,
    )

    page.showPage()
    page.save()
    output.seek(0)
    return output
