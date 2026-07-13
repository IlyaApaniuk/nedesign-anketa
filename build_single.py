#!/usr/bin/env python3
"""Собирает анкету в один самодостаточный HTML-файл (dist/anketa.html).

Картинки инлайнятся как data-URI. Если рядом есть папка img_small/
(уменьшенные копии), берёт картинки из неё — файл получается легче.
"""
import base64
import os
import pathlib

ROOT = pathlib.Path(__file__).parent
imgdir = ROOT / ('img_small' if (ROOT / 'img_small').is_dir() else 'img')

entries = []
for f in sorted(imgdir.glob('*.jpg')):
    b64 = base64.b64encode(f.read_bytes()).decode()
    entries.append(f'"img/{f.name}":"data:image/jpeg;base64,{b64}"')
img_map = 'window.IMG_MAP={' + ','.join(entries) + '};'

html = f"""<title>NE DESIGN — анкета клиента</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
{(ROOT / 'fonts.css').read_text()}
{(ROOT / 'styles.css').read_text()}
</style>
<div id="app"></div>
<script>
{(ROOT / 'jspdf.umd.min.js').read_text()}
</script>
<script>
{(ROOT / 'pdffont.js').read_text()}
</script>
<script>
{(ROOT / 'data.js').read_text()}
</script>
<script>{img_map}</script>
<script>
{(ROOT / 'app.js').read_text()}
</script>
"""

out = ROOT / 'dist' / 'anketa.html'
out.parent.mkdir(exist_ok=True)
out.write_text(html)
print(out, f'{out.stat().st_size / 1e6:.1f} MB')
