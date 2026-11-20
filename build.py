"""Assemble ComptaPro en un seul fichier HTML autonome (dist/comptapro.html)."""
import pathlib
import re

root = pathlib.Path(__file__).parent
html = (root / "index.html").read_text(encoding="utf-8")
css = (root / "css/style.css").read_text(encoding="utf-8")

body = re.search(r"<body>(.*)</body>", html, re.S).group(1)
body = re.sub(r'\s*<script src="[^"]+"></script>', "", body)
scripts = [x for x in re.findall(r'<script src="([^"]+)"></script>', html) if not x.startswith("vendor/")]
js = "\n".join((root / s).read_text(encoding="utf-8") for s in scripts)

out = f"""<title>ComptaPro Belgique</title>
<style>
{css}
</style>
{body.strip()}
<script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"></script>
<script>
{js.replace('</script', '<\\/script')}
</script>
"""
dist = root / "dist"
dist.mkdir(exist_ok=True)
(dist / "comptapro.html").write_text(out, encoding="utf-8")
print("dist/comptapro.html", len(out), "octets")
