#!/usr/bin/env python3
"""PT カルテ のアイコンを生成する。
rsvg-convert で SVG を PNG 化し、PIL で favicon.ico を作る。
出力: ../icons/{icon-192,icon-512,icon-maskable-512,apple-touch-icon}.png, favicon.ico
"""
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

ICONS = Path(__file__).resolve().parent.parent / "icons"
ICONS.mkdir(exist_ok=True)

TEAL = "#0f766e"
TEAL_DK = "#0b5750"

LOGO = """
  <g transform="translate({tx},{ty}) scale({s})">
    <!-- clipboard -->
    <rect x="34" y="22" width="132" height="164" rx="16" fill="#ffffff"/>
    <rect x="78" y="10" width="44" height="30" rx="8" fill="#e2e8f0"/>
    <rect x="86" y="16" width="28" height="10" rx="5" fill="#94a3b8"/>
    <!-- lines -->
    <rect x="52" y="58" width="78" height="10" rx="5" fill="#cbd5e1"/>
    <rect x="52" y="82" width="96" height="10" rx="5" fill="#cbd5e1"/>
    <rect x="52" y="106" width="64" height="10" rx="5" fill="#cbd5e1"/>
    <!-- dumbbell -->
    <g transform="translate(52,132)">
      <rect x="0" y="14" width="14" height="34" rx="4" fill="{teal}"/>
      <rect x="12" y="20" width="10" height="22" rx="3" fill="{teal}"/>
      <rect x="22" y="24" width="52" height="14" rx="7" fill="{teal}"/>
      <rect x="74" y="20" width="10" height="22" rx="3" fill="{teal}"/>
      <rect x="82" y="14" width="14" height="34" rx="4" fill="{teal}"/>
    </g>
    <!-- pencil -->
    <g transform="rotate(45 150 60)">
      <rect x="140" y="8" width="20" height="96" rx="5" fill="{teal}"/>
      <rect x="140" y="8" width="20" height="16" rx="5" fill="{teal_dk}"/>
      <polygon points="140,104 160,104 150,124" fill="#fbbf24"/>
      <polygon points="146,116 154,116 150,124" fill="#1f2937"/>
    </g>
  </g>
"""


def svg(maskable: bool) -> str:
    bg = f'<rect width="200" height="200" fill="{TEAL}"/>'
    if maskable:
        logo = LOGO.format(tx=26, ty=24, s=0.74, teal=TEAL, teal_dk=TEAL_DK)
    else:
        bg = f'<rect width="200" height="200" rx="44" fill="{TEAL}"/>'
        logo = LOGO.format(tx=2, ty=2, s=0.98, teal=TEAL, teal_dk=TEAL_DK)
    return (
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" '
        'width="200" height="200">' + bg + logo + "</svg>"
    )


def render(svg_text: str, size: int, out: Path) -> None:
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as f:
        f.write(svg_text)
        tmp = f.name
    subprocess.run(
        ["rsvg-convert", "-w", str(size), "-h", str(size), tmp, "-o", str(out)],
        check=True,
    )
    Path(tmp).unlink()
    print("wrote", out.name)


def main() -> None:
    std = svg(False)
    msk = svg(True)
    render(std, 512, ICONS / "icon-512.png")
    render(std, 192, ICONS / "icon-192.png")
    render(std, 180, ICONS / "apple-touch-icon.png")
    render(msk, 512, ICONS / "icon-maskable-512.png")

    base = Image.open(ICONS / "icon-512.png").convert("RGBA")
    base.resize((64, 64), Image.LANCZOS).save(
        ICONS / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)]
    )
    print("wrote favicon.ico")


if __name__ == "__main__":
    main()
