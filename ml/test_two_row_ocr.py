import cv2
import glob
import easyocr
import os
import re

reader = easyocr.Reader(['en'], gpu=True)
files = sorted(glob.glob('ml/debug_crops/alpr_benchmark/alpr_t*.png'))
m_files = [f for f in files if any(f't{t}_' in os.path.basename(f) for t in [8, 39, 66, 93])]

print(f"Testing two-row OCR on {len(m_files)} motorcycle crops:")
for f in m_files:
    img = cv2.imread(f)
    h, w = img.shape[:2]
    ar = w / float(h)
    
    # 1. single-pass OCR
    res_single = reader.readtext(img, allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ')
    single_txt = ' '.join(r[1] for r in res_single)
    single_conf = [r[2] for r in res_single]
    
    # 2. two-row OCR (split horizontally with slight overlap)
    top = img[0:int(h * 0.55), :]
    bot = img[int(h * 0.45):h, :]
    
    # Scale each half so text has enough pixel height
    scale_top = max(1, int(50 / max(top.shape[0], 1)))
    scale_bot = max(1, int(50 / max(bot.shape[0], 1)))
    if scale_top > 1:
        top = cv2.resize(top, (top.shape[1] * scale_top, top.shape[0] * scale_top), interpolation=cv2.INTER_CUBIC)
    if scale_bot > 1:
        bot = cv2.resize(bot, (bot.shape[1] * scale_bot, bot.shape[0] * scale_bot), interpolation=cv2.INTER_CUBIC)

    res_top = reader.readtext(top, allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ')
    res_bot = reader.readtext(bot, allowlist='ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ')
    
    top_txt = ' '.join(r[1] for r in res_top)
    bot_txt = ' '.join(r[1] for r in res_bot)
    combined = f"{top_txt} {bot_txt}".strip()
    
    print(f"{os.path.basename(f)} ({w}x{h}, AR={ar:.2f}):")
    print(f"   Single:  '{single_txt}'")
    print(f"   Two-Row: Top='{top_txt}' | Bot='{bot_txt}' -> '{combined}'")
