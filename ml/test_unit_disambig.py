import re
from collections import defaultdict

INDIAN_STATE_CODES = {
    "TN": "Tamil Nadu", "KA": "Karnataka", "KL": "Kerala", "AP": "Andhra Pradesh",
    "TS": "Telangana", "MH": "Maharashtra", "DL": "Delhi NCR", "HR": "Haryana",
    "UP": "Uttar Pradesh", "GJ": "Gujarat", "RJ": "Rajasthan", "WB": "West Bengal",
}

PLATE_REGEX = re.compile(r"^([A-Z]{2})\s*([0-9]{1,2})\s*([A-Z]{1,3})\s*([0-9]{4})$")
CHAR_TO_DIGIT = {"O": "0", "Q": "0", "D": "0", "S": "5", "I": "1", "L": "1", "Z": "2", "B": "8", "G": "6"}
DIGIT_TO_CHAR = {"0": "O", "1": "I", "5": "S", "8": "B", "2": "Z", "6": "G"}

def _clean_and_disambiguate_single_candidate(clean: str):
    if not (8 <= len(clean) <= 11):
        return None
    state = "".join(DIGIT_TO_CHAR.get(c, c) if c.isdigit() else c for c in clean[:2])
    num = "".join(CHAR_TO_DIGIT.get(c, c) if not c.isdigit() else c for c in clean[-4:])
    middle = clean[2:-4]

    if len(middle) == 4:
        rto = "".join(CHAR_TO_DIGIT.get(c, c) if not c.isdigit() else c for c in middle[:2])
        ser = "".join(DIGIT_TO_CHAR.get(c, c) if c.isdigit() else c for c in middle[2:])
        rep = f"{state}{rto}{ser}{num}"
        if re.match(r"^([A-Z]{2})([0-9]{1,2})([A-Z]{1,3})([0-9]{4})$", rep):
            return rep
    elif len(middle) == 3:
        rto1 = "".join(CHAR_TO_DIGIT.get(c, c) if not c.isdigit() else c for c in middle[:2])
        ser1 = "".join(DIGIT_TO_CHAR.get(c, c) if c.isdigit() else c for c in middle[2:])
        rep1 = f"{state}{rto1}{ser1}{num}"
        if re.match(r"^([A-Z]{2})([0-9]{1,2})([A-Z]{1,3})([0-9]{4})$", rep1):
            return rep1

        rto2 = "".join(CHAR_TO_DIGIT.get(c, c) if not c.isdigit() else c for c in middle[:1])
        ser2 = "".join(DIGIT_TO_CHAR.get(c, c) if c.isdigit() else c for c in middle[1:])
        rep2 = f"{state}{rto2}{ser2}{num}"
        if re.match(r"^([A-Z]{2})([0-9]{1,2})([A-Z]{1,3})([0-9]{4})$", rep2):
            return rep2
    elif len(middle) == 2:
        rto = "".join(CHAR_TO_DIGIT.get(c, c) if not c.isdigit() else c for c in middle[:1])
        ser = "".join(DIGIT_TO_CHAR.get(c, c) if c.isdigit() else c for c in middle[1:])
        rep = f"{state}{rto}{ser}{num}"
        if re.match(r"^([A-Z]{2})([0-9]{1,2})([A-Z]{1,3})([0-9]{4})$", rep):
            return rep

    return None

def correct_indian_plate(raw_text: str) -> str:
    clean = re.sub(r"[^A-Za-z0-9]", "", raw_text.strip().upper())
    if not clean:
        return ""

    if re.match(r"^([A-Z]{2})([0-9]{1,2})([A-Z]{1,3})([0-9]{4})$", clean):
        return clean

    repaired = _clean_and_disambiguate_single_candidate(clean)
    if repaired:
        return repaired

    if len(clean) > 8 and 8 <= len(clean[1:]) <= 11:
        lead_stripped = _clean_and_disambiguate_single_candidate(clean[1:])
        if lead_stripped:
            return lead_stripped

    if len(clean) > 8 and 8 <= len(clean[:-1]) <= 11:
        trail_stripped = _clean_and_disambiguate_single_candidate(clean[:-1])
        if trail_stripped:
            return trail_stripped

    return clean

def format_plate_number(raw_text: str) -> str:
    clean = correct_indian_plate(raw_text)
    match = re.match(r"^([A-Z]{2})([0-9]{1,2})([A-Z]{1,3})([0-9]{4})$", clean)
    if match:
        state, dist, series, num = match.groups()
        return f"{state} {dist.zfill(2)} {series} {num}"
    return clean

# Sanity checks
sanity_plates = [
    "TN38HL1234",
    "MH12ML5678",
    "KO01AB1234",
    "KA05NL9156",
    "KAOSNL9156",
    "KAOSHL9156",
    "FKAOSHL9156",
    "FKAOSHL 9156",
]

print("=== SANITY TEST RESULTS ===")
for p in sanity_plates:
    fmt = format_plate_number(p)
    valid = bool(PLATE_REGEX.match(fmt))
    print(f"{p:<16} -> {fmt:<18} (valid: {valid})")

# Verify sanity plates did NOT rewrite HL or ML or KO
assert format_plate_number("TN38HL1234") == "TN 38 HL 1234", "TN38HL1234 was corrupted!"
assert format_plate_number("MH12ML5678") == "MH 12 ML 5678", "MH12ML5678 was corrupted!"
assert format_plate_number("KO01AB1234") == "KO 01 AB 1234", "KO01AB1234 was corrupted!"
assert format_plate_number("KA05NL9156") == "KA 05 NL 9156"
assert format_plate_number("KAOSNL9156") == "KA 05 NL 9156"
assert format_plate_number("FKAOSHL9156") == "KA 05 HL 9156", f"Failed: {format_plate_number('FKAOSHL9156')}"
print("\nAll assertions passed!")
