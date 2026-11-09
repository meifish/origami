from pathlib import Path
import argparse
import zipfile
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageOps

parser = argparse.ArgumentParser(description='Recolor the style previews for photos 3 and 4.')
parser.add_argument('--output', type=Path, default=Path('outputs'))
args = parser.parse_args()
out = args.output
assets = out / 'assets'
board = Image.new('RGB', (1560, 850), '#F5F0E7')
draw = ImageDraw.Draw(board)
def label(x, y, s, size):
    draw.text((x, y), s, fill='#25353E', font=ImageFont.load_default(size=size))

label(35, 25, 'Paper Atelier  /  Ochre color study', 38)
label(35, 80, 'Original gray-blue reference alongside three ochre treatments', 21)
styles = ['Original cutout', 'Soft Editorial', 'Textured Illustration', 'Graphic Paper Art']
for j, name in enumerate(styles):
    label(155+350*j, 134, name, 23)

with zipfile.ZipFile(out/'ochre-03-04.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for i in (3, 4):
        y = 173+(i-3)*329
        label(35, y+128, f'{i:02d}', 35)
        for j, name in enumerate(styles):
            slug = name.lower().replace(' ', '-')
            im = Image.open(assets/f'{i:02d}-{slug}.png').convert('RGBA')
            if j:
                data = np.array(im)
                alpha = data[:,:,3].copy()
                luma = np.sum(data[:,:,:3] * np.array([.2126,.7152,.0722]), axis=2)
                target = np.array([178,143,75]) + (luma[:,:,None]-108)
                data[:,:,:3] = np.clip(np.rint(target), 0, 255)
                im = Image.fromarray(data)
                assert np.array_equal(np.asarray(im.getchannel('A')), alpha)
                path = assets/f'{i:02d}-{slug}-ochre.png'
                im.save(path)
                archive.write(path,path.name)
            preview = ImageOps.contain(im, (320,300), Image.Resampling.LANCZOS)
            board.paste(preview, (145+350*j+(320-preview.width)//2, y+(300-preview.height)//2), preview)
board.save(out/'ochre-comparison-03-04.png')
