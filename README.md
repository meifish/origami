# Origami photo stylization

Create transparent origami cutouts, compare three deterministic paper treatments,
and recolor the results for photos 3 and 4 to ochre.

```sh
python3 -m pip install -r requirements.txt
python3 stylize.py photo1.jpg photo2.jpg photo3.jpg photo4.jpg photo5.jpg
python3 ochre.py
```

Pass the photos in fold order. The first four get Soft Editorial (guided
smoothing), Textured Illustration (detail decomposition), and Graphic Paper Art
(luminance quantization). Photos 3–5 rotate 90 degrees counterclockwise after
EXIF orientation is applied. Both commands accept `--output` to select a
directory other than `outputs`.

The comparison boards, mask overlays, transparent PNGs, and ZIP files are
written to the output directory. The original photographs are supplied
locally. The mask estimates the outline from the cool paper against the warm
background in this photo series. Use the mask overlay to review alignment for
other photos. The stylizations reuse the same alpha channel. Quantization
can produce visible tonal bands, so review folds against the original cutout.
