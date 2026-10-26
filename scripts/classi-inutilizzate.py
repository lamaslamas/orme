#!/usr/bin/env python3
"""Elenca le classi CSS di src/stile.css che nessun file di src (js, html) nomina: candidate da togliere."""
import re, subprocess, sys
css = open('src/stile.css').read()
css = re.sub(r'/\*.*?\*/', '', css, flags=re.S)
classi = set(re.findall(r'\.([a-zA-Z_][\w-]*)', re.sub(r'\{[^{}]*\}', '{}', css)))
files = [f for f in subprocess.check_output(['git', 'ls-files', 'src', 'index.html'], text=True).split() if f.endswith(('.js', '.html'))]
testo = '\n'.join(open(f).read() for f in files)
inutili = sorted(c for c in classi if not re.search(r'(?<![\w-])' + re.escape(c) + r'(?![\w-])', testo))
print('\n'.join(inutili))
print(len(inutili), 'su', len(classi), file=sys.stderr)
