from app.modules.vehicles import certificate_renderer_v3
from app.modules.vehicles.certificate_font_cache import ensure_certificate_fonts

certificate_renderer_v3.FONT_DIR = ensure_certificate_fonts()
render_certificate_pdf = certificate_renderer_v3.render_certificate_pdf

__all__ = ["render_certificate_pdf"]
