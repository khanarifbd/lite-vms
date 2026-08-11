import re
import unicodedata

BANGLA_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")

LOCATION_ALIASES = {
    "ঢাকা": "DHAKA",
    "চট্টগ্রাম": "CHATTOGRAM",
    "চট্রগ্রাম": "CHATTOGRAM",
    "চিটাগাং": "CHATTOGRAM",
    "CHATTOGRAM": "CHATTOGRAM",
    "CHITTAGONG": "CHATTOGRAM",
    "রাজশাহী": "RAJSHAHI",
    "খুলনা": "KHULNA",
    "বরিশাল": "BARISHAL",
    "BARISAL": "BARISHAL",
    "BARISHAL": "BARISHAL",
    "সিলেট": "SYLHET",
    "রংপুর": "RANGPUR",
    "ময়মনসিংহ": "MYMENSINGH",
    "ময়মনসিংহ": "MYMENSINGH",
    "কুমিল্লা": "CUMILLA",
    "COMILLA": "CUMILLA",
    "CUMILLA": "CUMILLA",
    "নারায়ণগঞ্জ": "NARAYANGANJ",
    "নারায়ণগঞ্জ": "NARAYANGANJ",
    "গাজীপুর": "GAZIPUR",
    "মেট্রো": "METRO",
}

SERIES_ALIASES = {
    "অ": "A",
    "আ": "A",
    "ই": "I",
    "ঈ": "I",
    "উ": "U",
    "এ": "E",
    "ও": "O",
    "ক": "KA",
    "খ": "KHA",
    "গ": "GA",
    "ঘ": "GHA",
    "ঙ": "NGA",
    "চ": "CHA",
    "ছ": "CHHA",
    "জ": "JA",
    "ঝ": "JHA",
    "ট": "TA",
    "ঠ": "THA",
    "ড": "DA",
    "ঢ": "DHA",
    "ত": "TA",
    "থ": "THA",
    "দ": "DA",
    "ধ": "DHA",
    "ন": "NA",
    "প": "PA",
    "ফ": "PHA",
    "ব": "BA",
    "ভ": "BHA",
    "ম": "MA",
    "য": "YA",
    "র": "RA",
    "ল": "LA",
    "শ": "SHA",
    "ষ": "SHA",
    "স": "SA",
    "হ": "HA",
}

LATIN_SERIES_ALIASES = {
    "G": "GA",
    "GA": "GA",
    "KA": "KA",
    "KHA": "KHA",
    "CHA": "CHA",
    "JA": "JA",
    "TA": "TA",
    "DA": "DA",
    "DHA": "DHA",
    "NA": "NA",
    "PA": "PA",
    "BA": "BA",
    "BHA": "BHA",
    "MA": "MA",
    "RA": "RA",
    "LA": "LA",
    "SHA": "SHA",
    "SA": "SA",
    "HA": "HA",
}


def _canonical_token(token: str) -> str:
    if token in LOCATION_ALIASES:
        return LOCATION_ALIASES[token]
    if token in SERIES_ALIASES:
        return SERIES_ALIASES[token]
    upper = token.upper()
    if upper in LOCATION_ALIASES:
        return LOCATION_ALIASES[upper]
    return LATIN_SERIES_ALIASES.get(upper, upper)


def normalize_bangladesh_registration(value: str) -> str:
    """Return one searchable identity for Bangla/English BRTA registration text.

    The function converts Bangla digits, common authority/location aliases, Metro,
    and Bangla vehicle-series letters before applying stable separators.
    """
    normalized = unicodedata.normalize("NFKC", value).translate(BANGLA_DIGITS).strip()
    for source, target in sorted(LOCATION_ALIASES.items(), key=lambda item: len(item[0]), reverse=True):
        normalized = normalized.replace(source, f" {target} ")
    normalized = re.sub(r"[\s_/,:;|]+", "-", normalized)
    normalized = re.sub(r"-+", "-", normalized).strip("-")
    tokens = [_canonical_token(token) for token in normalized.split("-") if token]
    canonical = "-".join(tokens)
    canonical = re.sub(r"[^A-Z0-9-]", "", canonical.upper())
    canonical = re.sub(r"-+", "-", canonical).strip("-")
    if len(canonical) < 3:
        raise ValueError("A valid Bangladesh vehicle registration number is required")
    return canonical


def normalize_vehicle_serial(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).translate(BANGLA_DIGITS).upper().strip()
    normalized = re.sub(r"[^A-Z0-9]", "", normalized)
    if len(normalized) < 3:
        raise ValueError("A valid vehicle serial identity is required")
    return normalized
