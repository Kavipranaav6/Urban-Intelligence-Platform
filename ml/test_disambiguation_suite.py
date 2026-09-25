import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from ml.inference.anpr_detector import correct_indian_plate, format_plate_number, PLATE_REGEX

test_cases = [
    # Clean plates
    "TN38AB1234",
    "KA01MJ8821",
    "MH12DE1433",
    "DL3C4912",
    "KA05NL9156",
    # Noisy OCR reads for KA05NL9156 from driving.mp4
    "KAOSNL9156",
    "KAOSHL9156",
    "KAOSML9 156",
    "KAOSNL9 150",
    "KAOSAL9 156",
    "KAOSML9 I56",
    "KAOSAL9156",
    "K105 L9156",
    "KAOSHL9 156",
    "KAOSH9156",
    "FKAOSHL9156",
    "FKAOSHL 9156",
    "KAOSNL 9 156",
    # Other plates that might have HL, ML, KO
    "TN38HL1234",
    "KA05ML1234",
    "KO01AB1234",
]

print(f"{'Input':<20} | {'Disambiguated':<15} | {'Formatted':<18} | {'Regex Match':<12}")
print("-" * 75)
for t in test_cases:
    dis = correct_indian_plate(t)
    fmt = format_plate_number(t)
    m = bool(PLATE_REGEX.match(fmt))
    print(f"{t:<20} | {dis:<15} | {fmt:<18} | {str(m):<12}")
