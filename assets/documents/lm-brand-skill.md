Apply Lightmatter brand guidelines to a PowerPoint slide deck for reimport into Google Slides.

## Workflow

1. User downloads a Google Slides deck as .pptx and provides the file path
2. Use python-pptx (install via venv in scratchpad if needed) to apply brand styles
3. Save the corrected .pptx in place
4. User reimports into Google Slides

Install python-pptx if needed:
```
python3 -m venv $SCRATCHPAD/venv && $SCRATCHPAD/venv/bin/pip install python-pptx -q
```

## Typography (Google Slides)

- **Font: DM Sans only** — no Arial, Calibri, or any other font
- **Weights: Regular and Medium only**
  - DM Sans Regular → body copy, labels, captions
  - DM Sans Medium → headings and emphasis
- **Default text color: #000000**
- Do NOT apply synthetic bold — use DM Sans Medium instead
- Do NOT use SemiBold, Bold, or Light weights
- Do NOT use all caps
- Set DM Sans explicitly on every text run — do not rely on theme font inheritance (Google Slides ignores it)

## Color Palette

### Primary
| Name | Hex |
|------|-----|
| Red | #FF3300 (exact — not #FF0000 or similar) |
| Black | #000000 |
| White | #FFFFFF |

### Secondary
| Name | Hex |
|------|-----|
| Cyan | #00E7E7 |
| Blue | #0033FF |
| Purple | #7300FF |
| Magenta | #FF00DB |

### Color Ramps (7 steps, lightest → darkest)
| Family | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|--------|---|---|---|---|---|---|---|
| Red | #FFD6CC | #FFAD99 | #FF704C | #FF3300 | #CC2800 | #991E00 | #661400 |
| Cyan | #CCFAFA | #99F5F5 | #4CEEEE | #00E7E7 | #00B8B8 | #008A8A | #005C5C |
| Blue | #CCD6FF | #99ADFF | #4C70FF | #0033FF | #0028CC | #001E99 | #001466 |
| Purple | #E3CCFF | #C799FF | #9D4CFF | #7300FF | #5C00CC | #450099 | #2E0066 |
| Magenta | #FFCCF7 | #FF99F0 | #FF4CE5 | #FF00DB | #CC00AF | #990083 | #660057 |
| Grey | #F9F9F9 | #EEEEEE | #D4D4D4 | #BBBBBB | #757575 | #333333 | #111111 |
| Cool Grey | #F5F6FA | #E6E8F0 | #C6CAD8 | #A8ADC2 | #696D7E | #2E313D | #15161B |

### Color Usage Rules
- Brand red is #FF3300 exactly
- Grey / Cool Grey ramps for graphics, lines, and fills
- Use Cool Grey when you want a blue-tinted grey
- For charts: one color family per data series
- Cyan (#00B8B8 / #00E7E7) = positive cue
- Dark red (#CC2800) or cyan = highlight

## Reference Files
All downloads available at lightmatter.co/brand/ — style guide, color reference, and PowerPoint theme.
