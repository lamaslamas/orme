#!/usr/bin/env python3
"""Toglie da un file CSS le regole (o i selettori di una lista) che nominano certi token.
uso: python3 scripts/togli-css.py src/stile.css daqui,barra-daqui ...
Un token è una sottostringa del selettore (es. ".daqui-" o "misura-barra"). Rimuove anche i blocchi dentro @media."""
import re, sys

def analizza(testo):
    """lista di nodi: ('commento', t) | ('regola', selettore, corpo) | ('at', intestazione, [nodi]) | ('altro', t)"""
    nodi = []
    i = 0
    n = len(testo)
    while i < n:
        if testo.startswith('/*', i):
            j = testo.index('*/', i) + 2
            nodi.append(('commento', testo[i:j]))
            i = j
            continue
        if testo[i].isspace():
            j = i
            while j < n and testo[j].isspace():
                j += 1
            nodi.append(('spazio', testo[i:j]))
            i = j
            continue
        # intestazione fino a { o ;
        j = i
        while j < n and testo[j] not in '{;':
            if testo.startswith('/*', j):
                j = testo.index('*/', j) + 2
            else:
                j += 1
        if j >= n or testo[j] == ';':
            nodi.append(('altro', testo[i:j + 1]))
            i = j + 1
            continue
        intestazione = testo[i:j]
        # corpo bilanciato
        prof = 1
        k = j + 1
        while k < n and prof:
            if testo.startswith('/*', k):
                k = testo.index('*/', k) + 2
                continue
            if testo[k] == '{':
                prof += 1
            elif testo[k] == '}':
                prof -= 1
            k += 1
        corpo = testo[j + 1:k - 1]
        if intestazione.lstrip().startswith('@media') or intestazione.lstrip().startswith('@supports'):
            nodi.append(('at', intestazione, analizza(corpo)))
        else:
            nodi.append(('regola', intestazione, corpo))
        i = k
    return nodi

def separa_selettori(sel):
    parti, prof, cur = [], 0, ''
    for c in sel:
        if c in '([':
            prof += 1
        elif c in ')]':
            prof -= 1
        if c == ',' and prof == 0:
            parti.append(cur)
            cur = ''
        else:
            cur += c
    parti.append(cur)
    return parti

def filtra(nodi, token):
    r = []
    for nodo in nodi:
        if nodo[0] == 'regola':
            sels = separa_selettori(nodo[1])
            tieni = [s for s in sels if not any(t in s for t in token)]
            if not tieni:
                continue
            if len(tieni) != len(sels):
                r.append(('regola', (tieni[0].strip() if len(tieni) == 1 else ',\n'.join(x.strip() for x in tieni)) + ' ', nodo[2]))
            else:
                r.append(nodo)
        elif nodo[0] == 'at':
            dentro = filtra(nodo[2], token)
            if any(x[0] in ('regola', 'at') for x in dentro):
                r.append(('at', nodo[1], dentro))
        else:
            r.append(nodo)
    return r

def scrivi(nodi):
    out = ''
    for nodo in nodi:
        if nodo[0] in ('commento', 'spazio', 'altro'):
            out += nodo[1]
        elif nodo[0] == 'regola':
            out += nodo[1] + '{' + nodo[2] + '}'
        else:
            out += nodo[1] + '{' + scrivi(nodo[2]) + '}'
    return out

if __name__ == '__main__':
    percorso, token = sys.argv[1], sys.argv[2].split(',')
    testo = open(percorso).read()
    nuovo = scrivi(filtra(analizza(testo), token))
    # righe vuote multiple
    nuovo = re.sub(r'\n{3,}', '\n\n', nuovo)
    open(percorso, 'w').write(nuovo)
    print(f'{percorso}: {len(testo.splitlines())} → {len(nuovo.splitlines())} righe')
