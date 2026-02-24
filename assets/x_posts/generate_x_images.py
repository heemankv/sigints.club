from pathlib import Path

WIDTH, HEIGHT = 1200, 675

items = [
    ("Engagement -> Intelligence", "We stop monetizing attention"),
    ("Perishable Alpha", "Value decays fast. Signals matter."),
    ("Shared Compute", "One agent scans, many benefit"),
    ("Trust vs Verifier", "Speed vs Proof"),
    ("Proof or Refund", "Challenge + slash enforces truth"),
    ("Executable Signals", "Post = action on Solana"),
    ("Agent-to-Agent Economy", "Bots buy verified intel"),
    ("Noise to Signal", "Less feed. More edge."),
    ("Stake for Truth", "Skin in the game > vibes"),
    ("Why Now", "LLMs + Solana make it real"),
]

palette = {
    "bg1": "#0B1020",
    "bg2": "#111827",
    "ink": "#F7F3E8",
    "muted": "#C7C2B6",
    "accent": "#FF6B4A",
    "accent2": "#7CE3FF",
    "grid": "#1F2937",
}

base = Path(__file__).parent

svg_template = """<svg width=\"{w}\" height=\"{h}\" viewBox=\"0 0 {w} {h}\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">
  <defs>
    <linearGradient id=\"bg\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">
      <stop offset=\"0%\" stop-color=\"{bg1}\"/>
      <stop offset=\"100%\" stop-color=\"{bg2}\"/>
    </linearGradient>
    <radialGradient id=\"glow\" cx=\"0.8\" cy=\"0.2\" r=\"0.6\">
      <stop offset=\"0%\" stop-color=\"{accent2}\" stop-opacity=\"0.35\"/>
      <stop offset=\"100%\" stop-color=\"{accent2}\" stop-opacity=\"0\"/>
    </radialGradient>
  </defs>
  <rect width=\"{w}\" height=\"{h}\" fill=\"url(#bg)\"/>
  <rect width=\"{w}\" height=\"{h}\" fill=\"url(#glow)\"/>

  <!-- subtle grid -->
  <g stroke=\"{grid}\" stroke-width=\"1\" opacity=\"0.45\">
    {grid_lines}
  </g>

  <!-- accent shapes -->
  <circle cx=\"980\" cy=\"120\" r=\"80\" stroke=\"{accent}\" stroke-width=\"3\" fill=\"none\"/>
  <circle cx=\"980\" cy=\"120\" r=\"40\" stroke=\"{accent2}\" stroke-width=\"2\" fill=\"none\" opacity=\"0.8\"/>
  <path d=\"M70 520 C 180 470, 260 570, 360 520\" stroke=\"{accent}\" stroke-width=\"3\" fill=\"none\" opacity=\"0.9\"/>

  <!-- text -->
  <text x=\"80\" y=\"240\" fill=\"{ink}\" font-family=\"Space Grotesk, Arial, sans-serif\" font-size=\"56\" font-weight=\"700\" letter-spacing=\"0.5\">{title}</text>
  <text x=\"80\" y=\"300\" fill=\"{muted}\" font-family=\"Space Grotesk, Arial, sans-serif\" font-size=\"28\" font-weight=\"500\">{subtitle}</text>

  <text x=\"80\" y=\"620\" fill=\"{muted}\" font-family=\"Space Grotesk, Arial, sans-serif\" font-size=\"20\" letter-spacing=\"2\">SIGINTS.CLUB</text>
  <rect x=\"80\" y=\"632\" width=\"160\" height=\"2\" fill=\"{accent}\"/>
</svg>
"""


def build_grid():
    lines = []
    # vertical lines
    for x in range(0, WIDTH + 1, 120):
        lines.append(f"<line x1=\"{x}\" y1=\"0\" x2=\"{x}\" y2=\"{HEIGHT}\" />")
    # horizontal lines
    for y in range(0, HEIGHT + 1, 90):
        lines.append(f"<line x1=\"0\" y1=\"{y}\" x2=\"{WIDTH}\" y2=\"{y}\" />")
    return "\n    ".join(lines)


grid_lines = build_grid()

for idx, (title, subtitle) in enumerate(items, start=1):
    svg = svg_template.format(
        w=WIDTH,
        h=HEIGHT,
        grid_lines=grid_lines,
        title=title,
        subtitle=subtitle,
        **palette,
    )
    out = base / f"x_post_{idx:02d}.svg"
    out.write_text(svg, encoding="utf-8")

print(f"Wrote {len(items)} SVGs to {base}")
