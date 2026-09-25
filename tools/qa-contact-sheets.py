"""Make labeled, lossless inspection sheets from already captured QA images."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[1]
source = root / 'artifacts/screenshots-responsive'
output = root / 'artifacts/contact-sheets'
output.mkdir(exist_ok=True)
font = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 16)

def sheet(paths, name, columns, cell_width, cell_height, resize=False):
    rows = (len(paths) + columns - 1) // columns
    canvas = Image.new('RGB', (columns * cell_width, rows * (cell_height + 28)), '#dddddd')
    draw = ImageDraw.Draw(canvas)
    for i, path in enumerate(paths):
        image = Image.open(path).convert('RGB')
        if resize:
            image.thumbnail((cell_width, cell_height))
        x, y = (i % columns) * cell_width, (i // columns) * (cell_height + 28)
        draw.text((x + 6, y + 5), path.stem, font=font, fill='#111111')
        canvas.paste(image, (x, y + 28))
    canvas.save(output / (name + '.png'))

for theme in ['terminal', 'luna']:
    for kind, size, count, columns in [('compact', (360, 220), 8, 2), ('tall', (280, 660), 4, 4)]:
        paths = sorted(source.glob(f'{theme}-{kind}-*.png'))
        for start in range(0, len(paths), count):
            sheet(paths[start:start + count], f'{theme}-{kind}-{start // count + 1}', columns, *size)

sheet(sorted((root / 'Setpiece/Assets/Wallpapers').glob('*.jpg')), 'wallpapers', 4, 512, 288, True)
print(output)
