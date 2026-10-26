#!/usr/bin/env python3
"""Elenca le funzioni e costanti esportate da src che nessun altro file di src o scripts nomina (usate solo nei test o mai).
Da guardare a mano: un nome può essere usato in modo dinamico."""
import re, subprocess
files = subprocess.check_output(['git', 'ls-files', 'src', 'scripts'], text=True).split()
sorgenti = {f: open(f).read() for f in files if f.endswith(('.js', '.mjs'))}
test = {f: open(f).read() for f in subprocess.check_output(['git', 'ls-files', 'test'], text=True).split() if f.endswith('.js')}
risultato = []
for f, t in sorgenti.items():
    if not f.startswith('src/'):
        continue
    for m in re.finditer(r'^export (?:async )?(?:function\*? |const |let |class )([A-Za-z_$][\w$]*)', t, re.M):
        n = m.group(1)
        pat = re.compile(r'(?<![\w$])' + re.escape(n) + r'(?![\w$])')
        altrove = any(pat.search(x) for g, x in sorgenti.items() if g != f)
        dentro = len(pat.findall(t)) > 1
        if not altrove:
            nei_test = any(pat.search(x) for x in test.values())
            risultato.append((f, n, 'solo test' if nei_test else 'mai', 'usato nel file' if dentro else ''))
for r in sorted(risultato):
    print(*r)
