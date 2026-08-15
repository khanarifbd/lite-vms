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
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

from app.core.config import settings

if TYPE_CHECKING:
    from app.modules.owners.model import VehicleOwner
    from app.modules.vehicles.model import Vehicle

FIGMA_WIDTH = 1362.0
FIGMA_HEIGHT = 1920.0
ASSET_DIR = Path(__file__).resolve().parents[2] / "assets" / "certificate_template"
FONT_DIR = Path("/var/cache/lite-vms-certificate-fonts")
TEXT = colors.HexColor("#231f20")
SECONDARY = colors.Color(35 / 255, 31 / 255, 32 / 255, alpha=0.70)
ROW_TEXT = colors.HexColor("#505958")
GREEN = colors.HexColor("#008200")
CARD_BORDER = colors.Color(225 / 255, 0, 0, alpha=0.30)
BTRC_BORDER = colors.Color(225 / 255, 0, 0, alpha=0.06)

_FONT_SPECS = {
    "DMSansExtraBold": ("DMSans-ExtraBold.ttf", "Helvetica-Bold"),
    "DMSansRegular": ("DMSans-Regular.ttf", "Helvetica"),
    "DMSansMedium": ("DMSans-Medium.ttf", "Helvetica-Bold"),
    "AlumniSans": ("AlumniSans.ttf", "Helvetica"),
    "InterRegular": ("Inter.ttf", "Helvetica"),
    "InterItalic": ("Inter-Italic.ttf", "Helvetica-Oblique"),
    "UrbanistMedium": ("Urbanist-Medium.ttf", "Helvetica"),
    "UrbanistBold": ("Urbanist-Bold.ttf", "Helvetica-Bold"),
    "DotSans": ("42dotSans.ttf", "Helvetica"),
}
_REGISTERED_FONTS: dict[str, str] | None = None


def _fonts() -> dict[str, str]:
    global _REGISTERED_FONTS
    if _REGISTERED_FONTS is not None:
        return _REGISTERED_FONTS
    loaded: dict[str, str] = {}
    for alias, (filename, fallback) in _FONT_SPECS.items():
        path = FONT_DIR / filename
        if path.exists():
            try:
                pdfmetrics.registerFont(TTFont(alias, str(path)))
                loaded[alias] = alias
                continue
            except Exception:
                pass
        loaded[alias] = fallback
    _REGISTERED_FONTS = loaded
    return loaded


def _owner_name(vehicle: Vehicle, owner: VehicleOwner) -> str:
    registered = (vehicle.registered_owner_name or "").strip()
    return registered or owner.name or "Not recorded"


def _fit_size(text: str, font_name: str, maximum: float, minimum: float, width: float) -> float:
    size = maximum
    while size > minimum and pdfmetrics.stringWidth(text, font_name, size) > width:
        size = max(minimum, size - 0.25)
    return size


def _render_certificate_pdf_legacy(vehicle: Vehicle, owner: VehicleOwner, provider_legal_name: str) -> BytesIO:
    """Legacy vector renderer retained for historical certificate compatibility."""
    if not vehicle.certificate_number or not vehicle.certificate_issued_at or not vehicle.certificate_expires_at:
        raise ValueError("Certificate has not been issued")

    fonts = _fonts()
    output = BytesIO()
    page = canvas.Canvas(output, pagesize=A4)
    width, height = A4
    scale = width / FIGMA_WIDTH

    def x(value: float) -> float:
        return value * scale

    def y(value: float) -> float:
        return height - value * scale

    def draw_asset(name: str, left: float, top: float, asset_width: float, asset_height: float) -> None:
        path = ASSET_DIR / name
        if path.exists():
            page.drawImage(ImageReader(path), x(left), y(top + asset_height), x(asset_width), x(asset_height), mask="auto")

    def draw_text(text: str, *, anchor_x: float, baseline: float, font: str, size: float, align: str = "left", fill=TEXT, tracking: float = 0) -> None:
        font_size = x(size)
        text_object = page.beginText()
        text_object.setFont(font, font_size)
        text_object.setFillColor(fill)
        if tracking:
            text_object.setCharSpace(x(tracking))
        text_width = pdfmetrics.stringWidth(text, font, font_size)
        if tracking and len(text) > 1:
            text_width += x(tracking) * (len(text) - 1)
        origin = x(anchor_x)
        if align == "center":
            origin -= text_width / 2
        elif align == "right":
            origin -= text_width
        text_object.setTextOrigin(origin, y(baseline))
        text_object.textOut(text)
        page.drawText(text_object)

    def date_text(value: date | None, *, upper: bool = False, leading_zero: bool = False) -> str:
        if value is None:
            return "Not recorded"
        day = f"{value.day:02d}" if leading_zero else str(value.day)
        rendered = f"{day} {value.strftime('%B %Y')}"
        return rendered.upper() if upper else rendered

    def draw_value(value: str, *, right: float, baseline: float, max_width: float) -> None:
        font = fonts["UrbanistBold"]
        size = _fit_size(value, font, x(16), x(9), x(max_width))
        page.setFillColor(ROW_TEXT)
        page.setFont(font, size)
        page.drawRightString(x(right), y(baseline), value)

    page.setFillColor(colors.HexColor("#fdf9f5"))
    page.rect(0, 0, width, height, stroke=0, fill=1)
    draw_asset("pattern.png", -671, 0, 2705, FIGMA_HEIGHT)
    draw_asset("border.png", 21, 0, 1319.38, FIGMA_HEIGHT)
    draw_asset("background_mark.png", 210, 568, 943, 301.653)
    draw_asset("gomax_tracker.png", 110.07, 30, 238.47, 100)
    draw_asset("auto_generation.png", 936.45, 30, 315.47, 100)

    draw_text("AUTO GENERATION LIMITED", anchor_x=681, baseline=224, font=fonts["DMSansExtraBold"], size=38, align="center")
    draw_text("GPS TRACKER COMPLIANCE", anchor_x=681, baseline=338, font=fonts["AlumniSans"], size=96, align="center", tracking=-3.84)
    draw_text("CERTIFICATE", anchor_x=681, baseline=419, font=fonts["AlumniSans"], size=96, align="center", tracking=-3.84)

    chip_left, chip_top, chip_width, chip_height = 325.0, 465.0, 712.0, 62.0
    page.setFillColor(colors.HexColor("#f5eee7"))
    page.setStrokeColor(colors.HexColor("#e1b68d"))
    page.setLineWidth(x(1))
    page.roundRect(x(chip_left), y(chip_top + chip_height), x(chip_width), x(chip_height), x(12), stroke=1, fill=1)
    draw_text(f"GPS Certificate No: {vehicle.certificate_number}", anchor_x=681, baseline=506, font=fonts["DotSans"], size=26, align="center")

    verification_url = f"{settings.public_web_url.rstrip('/')}/verify/certificate/{quote(vehicle.certificate_number, safe='')}"
    qr_output = BytesIO()
    qrcode.make(verification_url).save(qr_output, format="PNG")
    qr_output.seek(0)
    # Figma frame 47:32: the verification QR occupies the upper-right header.
    # Keep this independent of the certificate-number chip so dynamic certificate
    # numbers never push the QR into the body copy.
    page.drawImage(ImageReader(qr_output), x(1048), y(202 + 240), x(240), x(240), mask="auto")
    draw_text("Scan to Verify", anchor_x=1168, baseline=476, font=fonts["DMSansMedium"], size=24, align="center", fill=colors.HexColor("#1e1e1e"))

    static_lines = [
        ("This is to clarify that the vehicle described below has been equipped with genuine, active and", 592),
        ("fully operational GPS tracking device installed by Go Max Tracker, a product of Auto generation Limited,", 628),
        ("a BTRC Licensed Vehicle Tracking Service (VTS) Provider.", 664),
        ("The certificate confirms that the installed GPS tracking device is functional and has been", 736),
        ("installed in accordance with applicable GPS tracking requirements and relevant directives issued", 772),
        ("by the Bangladesh Road Transport Authority (BRTA), where applicable.", 808),
    ]
    for line, baseline in static_lines:
        draw_text(line, anchor_x=681, baseline=baseline, font=fonts["InterRegular"], size=24, align="center", fill=SECONDARY)

    def draw_card(left: float, title: str, labels: list[str]) -> None:
        top, card_width, card_height = 859.0, 560.0, 329.0
        page.setStrokeColor(CARD_BORDER)
        page.setLineWidth(x(1))
        page.roundRect(x(left), y(top + card_height), x(card_width), x(card_height), x(12), stroke=1, fill=0)
        draw_text(title, anchor_x=left + 20, baseline=902, font=fonts["UrbanistBold"], size=24)
        row_top = 924.0
        for index, label in enumerate(labels):
            current_top = row_top + index * 49
            page.setFillColor(colors.white)
            page.roundRect(x(left + 20), y(current_top + 48), x(520), x(48), x(4), stroke=0, fill=1)
            draw_text(label, anchor_x=left + 44, baseline=current_top + 31, font=fonts["UrbanistMedium"], size=16, fill=ROW_TEXT)

    draw_card(101, "VEHICLE PARTICULARS", ["Owner Name:", "Registration No:", "Vehicle Type:", "Engine NO:", "Chassis No:"])
    draw_card(701, "VALIDITY INFORMATION", ["Date of Issue:", "Valid Until:", "VTS Installation Date:", "Current Status", "GPS Status"])

    value_baselines = [955, 1004, 1053, 1102, 1151]
    draw_value(_owner_name(vehicle, owner), right=617, baseline=value_baselines[0], max_width=275)
    draw_value((vehicle.registration_number_display or vehicle.registration_number).upper(), right=617, baseline=value_baselines[1], max_width=275)
    draw_value(vehicle.vehicle_type or "Not recorded", right=617, baseline=value_baselines[2], max_width=275)
    draw_value(vehicle.engine_number or "Not recorded", right=617, baseline=value_baselines[3], max_width=275)
    draw_value(vehicle.chassis_number or "Not recorded", right=617, baseline=value_baselines[4], max_width=275)
    draw_value(date_text(vehicle.certificate_issued_at), right=1217, baseline=value_baselines[0], max_width=250)
    draw_value(date_text(vehicle.certificate_expires_at, upper=True), right=1217, baseline=value_baselines[1], max_width=250)
    draw_value(date_text(vehicle.vts_installation_date, leading_zero=True), right=1217, baseline=value_baselines[2], max_width=250)

    def draw_status(text: str, baseline: float) -> None:
        font = fonts["UrbanistBold"]
        size = x(16)
        right = x(1217)
        text_width = pdfmetrics.stringWidth(text, font, size)
        page.setFillColor(ROW_TEXT)
        page.setFont(font, size)
        page.drawRightString(right, y(baseline), text)
        dot_x = right - text_width - x(22)
        dot_y = y(baseline - 4)
        page.setStrokeColor(GREEN)
        page.setFillColor(colors.Color(0, 130 / 255, 0, alpha=0.04))
        page.circle(dot_x, dot_y, x(6.66), stroke=1, fill=1)
        page.setFillColor(GREEN)
        page.circle(dot_x, dot_y, x(3.75), stroke=0, fill=1)

    draw_status("Active", value_baselines[3])
    draw_status("Connected", value_baselines[4])

    page.setFillColor(colors.white)
    page.setStrokeColor(BTRC_BORDER)
    # This provider panel starts directly below the two information cards at
    # y=1248 in the Figma canvas, leaving the intended 60px visual gap.
    page.roundRect(x(101), y(1248 + 170), x(1160), x(170), x(12), stroke=1, fill=1)
    draw_asset("btrc_1.png", 131, 1308.37, 130, 89.63)
    draw_asset("btrc_2.png", 158.47, 1268, 72.47, 23.02)
    draw_asset("btrc_3.png", 150.63, 1285.22, 89.81, 92.94)
    draw_asset("btrc_4.png", 161.62, 1322.83, 68.78, 22.78)
    draw_asset("btrc_bangla_title.png", 309, 1282, 905, 38)
    draw_text("BTRC VTS License No:", anchor_x=309, baseline=1361, font=fonts["InterRegular"], size=26, fill=SECONDARY)
    draw_text("14.32.00000.007.58.055.18.44", anchor_x=575, baseline=1361, font=fonts["UrbanistBold"], size=26)

    draw_text("IMPORTANT NOTICE", anchor_x=101, baseline=1527, font=fonts["InterRegular"], size=24)
    draw_text("CONTACT INFO", anchor_x=544, baseline=1527, font=fonts["InterRegular"], size=24)
    notice = [
        ("• This certificate is valid only while the GPS", 101, 1566),
        ("subscription remains active.", 118, 1591),
        ("• Misuse of this certificate is an offence under", 101, 1633),
        ("Bangladesh ICT Act, 2006.", 118, 1658),
    ]
    for line, left, baseline in notice:
        draw_text(line, anchor_x=left, baseline=baseline, font=fonts["DMSansRegular"], size=18)
    contact = [
        "Call Center (24/7): +880 9666 766 766",
        "Any Query: +8801977-000601",
        "Email: support@gomaxtracker.com",
        "Website: www.gomaxtracker.com",
        "Dhaka Office: House# 646 (4th floor), Road # 9 (Main road)",
        "Mirpur DOHS. Dhaka-1216 Bangladesh",
        "Chattogram Office: House#1029-Sufea Monjil (Bata Goli),",
        "GEC, Chittagong Bangladesh",
    ]
    for index, line in enumerate(contact):
        draw_text(line, anchor_x=544, baseline=1566 + index * 24, font=fonts["DMSansRegular"], size=18)
    draw_asset("brta_emblem.png", 1076, 1498, 170, 170)
    draw_text("BRTA Approved", anchor_x=1161, baseline=1703, font=fonts["DMSansMedium"], size=20, align="center")
    draw_text("This is a system generated certificate and requires no manual signature.", anchor_x=681, baseline=1860, font=fonts["InterItalic"], size=18, align="center", fill=SECONDARY)
    draw_text("Powered by Auto generation Limited.", anchor_x=681, baseline=1886, font=fonts["InterItalic"], size=18, align="center", fill=SECONDARY)

    page.showPage()
    page.save()
    output.seek(0)
    return output


def render_certificate_pdf(vehicle: Vehicle, owner: VehicleOwner, provider_legal_name: str) -> BytesIO:
    """Render the selected Figma frame and overlay only certificate-specific data.

    The master is the exported 1362×1920 Figma frame (47:32).  Keeping it as
    the static layer prevents PDF font-engine differences from changing the
    approved artwork, watermark, Bengali copy, logos, or spacing.
    """
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

    def date_text(value: date | None, *, upper: bool = False, leading_zero: bool = False) -> str:
        if value is None:
            return "Not recorded"
        day = f"{value.day:02d}" if leading_zero else str(value.day)
        rendered = f"{day} {value.strftime('%B %Y')}"
        return rendered.upper() if upper else rendered

    master = ASSET_DIR / "figma_certificate_master.png"
    if not master.exists():
        # Keep a working fallback for source checkouts that pre-date the Figma master.
        return _render_certificate_pdf_legacy(vehicle, owner, provider_legal_name)
    page.drawImage(ImageReader(master), 0, 0, width, height, mask="auto")

    def clear(left: float, top: float, box_width: float, box_height: float, fill=colors.white) -> None:
        page.setFillColor(fill)
        page.rect(x(left), y(top + box_height), x(box_width), x(box_height), stroke=0, fill=1)

    def value(text: str, *, right: float, baseline: float, max_width: float, fill=ROW_TEXT) -> None:
        font = "Helvetica-Bold"
        size = x(16)
        minimum = x(9)
        while size > minimum and pdfmetrics.stringWidth(text, font, size) > x(max_width):
            size -= 0.1
        page.setFont(font, size)
        page.setFillColor(fill)
        page.drawRightString(x(right), y(baseline), text)

    # Certificate number: mask the sample number shipped in the Figma master.
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

    # QR is dynamic and always resolves to this deployment's public verifier.
    clear(1048, 202, 240, 240)
    verification_url = f"{settings.public_web_url.rstrip('/')}/verify/certificate/{quote(vehicle.certificate_number, safe='')}"
    qr_output = BytesIO()
    qrcode.make(verification_url).save(qr_output, format="PNG")
    qr_output.seek(0)
    page.drawImage(ImageReader(qr_output), x(1048), y(202 + 240), x(240), x(240), mask="auto")

    # The Figma master keeps every label and table line immutable. Only clear
    # the value cells, preserving the exact card artwork beneath all records.
    left_rows = [924 + index * 49 for index in range(5)]
    right_rows = [924 + index * 49 for index in range(5)]
    for row_top in left_rows:
        clear(350, row_top, 291, 48)
    for row_top in right_rows:
        clear(980, row_top, 261, 48)

    left_values = [
        _owner_name(vehicle, owner),
        (vehicle.registration_number_display or vehicle.registration_number).upper(),
        vehicle.vehicle_type or "Not recorded",
        vehicle.engine_number or "Not recorded",
        vehicle.chassis_number or "Not recorded",
    ]
    for index, item in enumerate(left_values):
        value(item, right=617, baseline=955 + index * 49, max_width=255)

    right_values = [
        date_text(vehicle.certificate_issued_at),
        date_text(vehicle.certificate_expires_at, upper=True),
        date_text(vehicle.vts_installation_date, leading_zero=True),
        "Active",
        "Connected",
    ]
    for index, item in enumerate(right_values):
        color = GREEN if index == 3 else ROW_TEXT
        value(item, right=1217, baseline=955 + index * 49, max_width=220, fill=color)
        if index >= 3:
            font_size = x(16)
            text_width = pdfmetrics.stringWidth(item, "Helvetica-Bold", font_size)
            dot_x = x(1217) - text_width - x(20)
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
