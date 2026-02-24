from pathlib import Path

out_dir = Path('/Users/heemankverma/Work/graveyard/assets/brand')

palette = {
    "bg1": "#0B1020",
    "bg2": "#111827",
    "ink": "#F7F3E8",
    "muted": "#C7C2B6",
    "accent": "#FF6B4A",
    "accent2": "#7CE3FF",
    "grid": "#1F2937",
}


def grid_lines(width, height, step_x, step_y):
    lines = []
    for x in range(0, width + 1, step_x):
        lines.append(f"<line x1=\"{x}\" y1=\"0\" x2=\"{x}\" y2=\"{height}\" />")
    for y in range(0, height + 1, step_y):
        lines.append(f"<line x1=\"0\" y1=\"{y}\" x2=\"{width}\" y2=\"{y}\" />")
    return "\n    ".join(lines)


def write_svg(path, width, height, title, subtitle, title_size, subtitle_size, mark=True):
    svg = f"""<svg width=\"{width}\" height=\"{height}\" viewBox=\"0 0 {width} {height}\" fill=\"none\" xmlns=\"http://www.w3.org/2000/svg\">
  <defs>
    <linearGradient id=\"bg\" x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\">
      <stop offset=\"0%\" stop-color=\"{palette['bg1']}\"/>
      <stop offset=\"100%\" stop-color=\"{palette['bg2']}\"/>
    </linearGradient>
    <radialGradient id=\"glow\" cx=\"0.85\" cy=\"0.2\" r=\"0.7\">
      <stop offset=\"0%\" stop-color=\"{palette['accent2']}\" stop-opacity=\"0.35\"/>
      <stop offset=\"100%\" stop-color=\"{palette['accent2']}\" stop-opacity=\"0\"/>
    </radialGradient>
  </defs>
  <rect width=\"{width}\" height=\"{height}\" fill=\"url(#bg)\"/>
  <rect width=\"{width}\" height=\"{height}\" fill=\"url(#glow)\"/>

  <g stroke=\"{palette['grid']}\" stroke-width=\"1\" opacity=\"0.45\">
    {grid_lines(width, height, max(80, width//15), max(70, height//8))}
  </g>

  <circle cx=\"{int(width*0.8)}\" cy=\"{int(height*0.2)}\" r=\"{int(min(width, height)*0.14)}\" stroke=\"{palette['accent']}\" stroke-width=\"3\" fill=\"none\"/>
  <circle cx=\"{int(width*0.8)}\" cy=\"{int(height*0.2)}\" r=\"{int(min(width, height)*0.07)}\" stroke=\"{palette['accent2']}\" stroke-width=\"2\" fill=\"none\" opacity=\"0.8\"/>

  <path d=\"M{int(width*0.07)} {int(height*0.78)} C {int(width*0.15)} {int(height*0.70)}, {int(width*0.22)} {int(height*0.84)}, {int(width*0.32)} {int(height*0.78)}\" stroke=\"{palette['accent']}\" stroke-width=\"3\" fill=\"none\" opacity=\"0.9\"/>

  <text x=\"{int(width*0.08)}\" y=\"{int(height*0.45)}\" fill=\"{palette['ink']}\" font-family=\"Space Grotesk, Avenir Next, Helvetica Neue, Arial, sans-serif\" font-size=\"{title_size}\" font-weight=\"700\">{title}</text>
  <text x=\"{int(width*0.08)}\" y=\"{int(height*0.56)}\" fill=\"{palette['muted']}\" font-family=\"Space Grotesk, Avenir Next, Helvetica Neue, Arial, sans-serif\" font-size=\"{subtitle_size}\" font-weight=\"500\">{subtitle}</text>

  <text x=\"{int(width*0.08)}\" y=\"{int(height*0.93)}\" fill=\"{palette['muted']}\" font-family=\"Space Grotesk, Avenir Next, Helvetica Neue, Arial, sans-serif\" font-size=\"{max(18, int(height*0.04))}\" letter-spacing=\"2\">SIGINTS.CLUB</text>
  <rect x=\"{int(width*0.08)}\" y=\"{int(height*0.95)}\" width=\"{int(width*0.14)}\" height=\"2\" fill=\"{palette['accent']}\"/>
</svg>
"""
    path.write_text(svg, encoding='utf-8')


# Profile
profile_svg = out_dir / 'x_profile.svg'
write_svg(
    profile_svg,
    400,
    400,
    title='SIGINTS',
    subtitle='club',
    title_size=44,
    subtitle_size=18,
)

# Cover
cover_svg = out_dir / 'x_cover.svg'
write_svg(
    cover_svg,
    1500,
    500,
    title='sigints.club',
    subtitle='Verified, time-sensitive intelligence',
    title_size=64,
    subtitle_size=28,
)

print(profile_svg)
print(cover_svg)
