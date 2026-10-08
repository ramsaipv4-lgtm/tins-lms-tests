#!/usr/bin/env python3
"""Builds and validates the games fixtures with real CPython (games contract r3, D-G12: CPython 3.14 is the oracle).

Run from anywhere:  python3 -I acceptance/fixtures/games/build_fixtures.py
Writes (deterministically):
  snek/corpus.json   AC-208: 120 programs inside the Snek subset with CPython's stdout (oracle version recorded)
  snek/step.json     AC-212: single-line-statement programs with CPython's sys.settrace line events and variables
  packs/outputs.json stdout of every snippet in the suite's own packs (drivers use it for the sniper boss)
  seeds/*.json       journey seeds (copies of fixtures/journeys/base.json plus games documents)
  package/           the v1 fixture package plus track1/games/<gameId>/<packId>.json (the suite's own packs)
  package-broken/    the v1 fixture package plus one broken pack (AC-215)
Validates: errors.json lines and exception classes, the sort fixtures, the own packs and the broken packs.
Exits 1 on any problem. No network, no product code.
"""
import ast
import builtins
import copy
import datetime as dt
import importlib.util
import io
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
FIX = os.path.dirname(HERE)
PROBLEMS = []


def problem(msg):
    PROBLEMS.append(msg)
    print('PROBLEM:', msg, file=sys.stderr)


def dump(path, obj):
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(obj, f, indent=2, ensure_ascii=False)
        f.write('\n')


def load(path):
    with open(path, encoding='utf-8') as f:
        return json.load(f)


ORACLE = f'{platform.python_implementation()} {platform.python_version()}'
if platform.python_implementation() != 'CPython' or sys.version_info[:2] != (3, 14):
    problem(f'the oracle must be CPython 3.14 (games contract D-G12); this is {ORACLE}')

# ---------------------------------------------------------------- Snek subset (§13.T3)
ALLOWED_BUILTINS = set('''len abs min max sum sorted reversed enumerate zip map filter any all int float str bool list dict set
tuple ord chr round isinstance print input range Exception ValueError TypeError IndexError KeyError ZeroDivisionError
AttributeError NameError AssertionError True False None'''.split())
STR_METHODS = set('upper lower split join strip replace find startswith endswith isdigit isalpha'.split())
LIST_METHODS = set('append pop insert remove index count extend sort reverse'.split())
DICT_METHODS = set('get items keys values setdefault pop'.split())
SET_METHODS = set('add discard remove'.split())
DEQUE_METHODS = set('append appendleft pop popleft extend'.split())
MODULE_ATTRS = {'math': {'floor', 'ceil', 'sqrt', 'inf'}, 'collections': {'deque'}, 'heapq': {'heappush', 'heappop', 'heapify'}}
METHODS = STR_METHODS | LIST_METHODS | DICT_METHODS | SET_METHODS | DEQUE_METHODS | set().union(*MODULE_ATTRS.values())
SPEC_RE = re.compile(r'^(\.\d+f|[<>]\d+|\d*d)$')
CALL_KW = {'sorted': {'key', 'reverse'}, 'print': {'sep', 'end'}}
BANNED = (ast.Yield, ast.YieldFrom, ast.Await, ast.AsyncFunctionDef, ast.AsyncFor, ast.AsyncWith, ast.With, ast.Global,
          ast.Nonlocal, ast.GeneratorExp, ast.Starred, ast.NamedExpr, ast.Match, ast.IfExp)


def subset_problems(src):
    """Returns reasons why src is outside the Snek subset ([] = inside)."""
    out = []
    try:
        tree = ast.parse(src)
    except SyntaxError as e:
        return [f'not Python: {e}']
    defined = set()
    class_methods = set()
    for n in ast.walk(tree):
        if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Store):
            defined.add(n.id)
        elif isinstance(n, (ast.FunctionDef, ast.ClassDef)):
            defined.add(n.name)
        elif isinstance(n, ast.arg):
            defined.add(n.arg)
        elif isinstance(n, (ast.Import, ast.ImportFrom)):
            for a in n.names:
                defined.add(a.asname or a.name)
        if isinstance(n, ast.ClassDef):
            class_methods |= {f.name for f in n.body if isinstance(f, ast.FunctionDef)}
    for n in ast.walk(tree):
        if isinstance(n, BANNED):
            out.append(f'{type(n).__name__} is outside the subset')
        if isinstance(n, ast.ClassDef) and (n.bases or n.keywords or n.decorator_list):
            out.append('class with bases, keywords or decorators')
        if isinstance(n, ast.FunctionDef):
            if n.decorator_list:
                out.append('decorator')
            for inner in ast.walk(n):
                if inner is not n and isinstance(inner, ast.FunctionDef):
                    out.append(f'nested def {inner.name} inside {n.name}')
        if isinstance(n, ast.Try):
            if n.finalbody or n.orelse:
                out.append('try with else/finally')
            for inner in ast.walk(n):
                if inner is not n and isinstance(inner, ast.Try):
                    out.append('nested try')
        if isinstance(n, (ast.For, ast.While)) and n.orelse:
            out.append('loop else')
        if isinstance(n, ast.Import):
            for a in n.names:
                if a.name not in MODULE_ATTRS:
                    out.append(f'import {a.name}')
        if isinstance(n, ast.ImportFrom):
            if n.module not in MODULE_ATTRS or any(a.name not in MODULE_ATTRS[n.module] for a in n.names):
                out.append(f'from {n.module} import ...')
        if isinstance(n, ast.FormattedValue):
            if n.conversion != -1:
                out.append('f-string conversion')
            if n.format_spec is not None:
                spec = ''.join(v.value for v in n.format_spec.values if isinstance(v, ast.Constant))
                if not SPEC_RE.match(spec):
                    out.append(f'f-string spec {spec!r}')
        if isinstance(n, ast.BinOp) and isinstance(n.op, ast.Mod) and (
                isinstance(n.left, ast.JoinedStr) or (isinstance(n.left, ast.Constant) and isinstance(n.left.value, str))):
            out.append('%-formatting')
        if isinstance(n, (ast.ListComp, ast.SetComp, ast.DictComp)) and len(n.generators) != 1:
            out.append('comprehension with more than one for')
        if isinstance(n, ast.Call):
            f = n.func
            if isinstance(f, ast.Attribute):
                if f.attr == 'format':
                    out.append('str.format')
                elif f.attr not in METHODS and f.attr not in class_methods:
                    out.append(f'method .{f.attr}()')
            if isinstance(f, ast.Name) and f.id in ALLOWED_BUILTINS and f.id not in defined:
                bad = {k.arg for k in n.keywords} - CALL_KW.get(f.id, set())
                if bad:
                    out.append(f'keyword argument(s) {sorted(bad)} to {f.id}()')
        if isinstance(n, ast.Attribute) and n.attr.startswith('__'):
            out.append(f'dunder attribute {n.attr}')
        if isinstance(n, ast.Name) and isinstance(n.ctx, ast.Load) and n.id not in defined and hasattr(builtins, n.id) \
                and n.id not in ALLOWED_BUILTINS:
            out.append(f'builtin {n.id}')
    return sorted(set(out))


def run_cpython(src, inp=None, timeout=20):
    with tempfile.TemporaryDirectory() as d:
        p = os.path.join(d, 'prog.py')
        with open(p, 'w', encoding='utf-8') as f:
            f.write(src)
        r = subprocess.run([sys.executable, '-I', p], input=('\n'.join(inp) + '\n') if inp else '', capture_output=True,
                           text=True, timeout=timeout, cwd=d)
        return r.returncode, r.stdout, r.stderr


def prints_a_set(src, inp):
    """Executes src in-process with print() watching for sets (Snek iterates sets in insertion order, §13.T3)."""
    found = []

    def has_set(v, depth=0):
        if isinstance(v, (set, frozenset)):
            return True
        if depth < 4 and isinstance(v, (list, tuple)):
            return any(has_set(x, depth + 1) for x in v)
        if depth < 4 and isinstance(v, dict):
            return any(has_set(x, depth + 1) for x in list(v.keys()) + list(v.values()))
        return False

    def watch_print(*args, **kw):
        if any(has_set(a) for a in args):
            found.append(args)
    feed = list(inp or [])
    g = {'__name__': '__main__', 'print': watch_print, 'input': lambda prompt='': feed.pop(0)}
    old = sys.stdout
    sys.stdout = io.StringIO()
    try:
        exec(compile(src, '<corpus>', 'exec'), g)
    finally:
        sys.stdout = old
    return bool(found)


MAX_INT = 2 ** 53 - 1


def build_corpus():
    spec = importlib.util.spec_from_file_location('corpus_programs', os.path.join(HERE, 'snek', 'corpus_programs.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    keep, excluded = [], []
    for pid, tags, src, inp in mod.P:
        reasons = subset_problems(src)
        if not reasons:
            code, out, err = run_cpython(src, inp)
            if code != 0 or err:
                reasons.append(f'CPython failed: {err.strip()[-200:]}')
            elif any(abs(int(t)) > MAX_INT for t in re.findall(r'(?<![\d.e])-?\d+(?![\d.e])', out) if len(t) > 15):
                reasons.append('prints an int beyond 53 bits')
            elif prints_a_set(src, inp):
                reasons.append('prints a set (order differs in Snek)')
        if reasons:
            excluded.append({'id': pid, 'reasons': reasons})
            continue
        if len(keep) >= 120:
            excluded.append({'id': pid, 'reasons': ['beyond the first 120 programs inside the subset']})
            continue
        e = {'id': pid, 'tags': tags.split(), 'source': src, 'stdout': out}
        if inp:
            e['input'] = inp
        keep.append(e)
    if len(keep) != 120:
        problem(f'corpus has {len(keep)} programs inside the subset, need 120')
    dump(os.path.join(HERE, 'snek', 'corpus.json'), {
        '_about': 'AC-208 Snek corpus. Each program is inside the Snek subset (checked by build_fixtures.py); stdout is '
                  'exactly what CPython printed (run with python3 -I, input lines on stdin). Compare stdout exactly.',
        'oracle': ORACLE, 'count': len(keep), 'programs': keep, 'excluded': excluded})
    return len(keep), excluded


# ---------------------------------------------------------------- step fixtures (AC-212)
STEP_PROGRAMS = [
    ('assign-loop', 'x = 1\ny = 2\ntotal = x + y\nfor i in range(3):\n    total += i\nif total > 5:\n    total = 0\nprint(total)\n', []),
    ('function', 'def double(n):\n    r = n * 2\n    return r\na = double(3)\nb = double(a)\nprint(a, b)\n', []),
    ('while', 'n = 3\ns = 0\nwhile n > 0:\n    s += n\n    n -= 1\nprint(s)\n', []),
    ('host', 'move()\nfor i in range(2):\n    turn_left()\n    move()\nprint("done")\n', ['move', 'turn_left']),
    ('elif-list', 'xs = []\nfor v in [3, 8, 5]:\n    if v < 5:\n        xs.append(v)\n    elif v > 5:\n        xs.append(0)\nprint(xs)\n', []),
]


def to_js(v):
    if isinstance(v, bool) or v is None or isinstance(v, (int, str)):
        return v
    if isinstance(v, float):
        return int(v) if v.is_integer() else v
    if isinstance(v, list):
        return [to_js(x) for x in v]
    if isinstance(v, tuple):
        return {'$tuple': [to_js(x) for x in v]}
    if isinstance(v, (set, frozenset)):
        return {'$set': [to_js(x) for x in v]}
    if isinstance(v, dict):
        return {str(k): to_js(x) for k, x in v.items()}
    return {'$object': type(v).__name__}


def snapshot(frame):
    src = frame.f_globals if frame.f_code.co_name == '<module>' else frame.f_locals
    out = {}
    for k, v in src.items():
        if k.startswith('__') or callable(v) or type(v).__name__ == 'module':
            continue
        out[k] = to_js(v)
    return out


def trace_program(src, hosts):
    events = []
    code = compile(src, '<step>', 'exec')

    def host(name):
        def fn(*args):
            events.append({'kind': 'call', 'line': sys._getframe(1).f_lineno, 'name': name, 'args': [to_js(a) for a in args]})
        return fn

    def local(frame, event, arg):
        if event == 'line' and frame.f_code.co_filename == '<step>':
            events.append({'kind': 'line', 'line': frame.f_lineno, 'vars': snapshot(frame)})
        return local

    def glob(frame, event, arg):
        return local if frame.f_code.co_filename == '<step>' else None
    g = {'__name__': '__main__'}
    for h in hosts:
        g[h] = host(h)
    old = sys.stdout
    sys.stdout = io.StringIO()
    sys.settrace(glob)
    try:
        exec(code, g)
    finally:
        sys.settrace(None)
        out = sys.stdout.getvalue()
        sys.stdout = old
    return events, out


def build_step():
    progs = []
    for pid, src, hosts in STEP_PROGRAMS:
        r = subset_problems(src)
        if r:
            problem(f'step program {pid} outside the subset: {r}')
        for line in src.splitlines():
            if line.rstrip().endswith(('\\', ',', '(', '[', '{')):
                problem(f'step program {pid} has a statement over several lines')
        events, out = trace_program(src, hosts)
        progs.append({'id': pid, 'source': src, 'hosts': hosts, 'stdout': out, 'events': events})
    dump(os.path.join(HERE, 'snek', 'step.json'), {
        '_about': 'AC-212: for each single-line-statement program, the events step() must yield in order: CPython '
                  'sys.settrace line events (vars = the current scope before the line runs, functions and modules left '
                  'out; floats with integer value appear as JS integers) and a call event for each host function, '
                  'right before it runs (games contract §13.T2).',
        'oracle': ORACLE, 'programs': progs})


# ---------------------------------------------------------------- errors and sorts
KIND_TO_PY = {'SyntaxError': 'SyntaxError', 'IndentationError': 'IndentationError', 'NameError': 'NameError',
              'IndexError': 'IndexError', 'TypeError': 'TypeError', 'AssertionError': 'AssertionError'}


def check_errors():
    for c in load(os.path.join(HERE, 'snek', 'errors.json'))['cases']:
        try:
            code = compile(c['source'], '<e>', 'exec')
            try:
                exec(code, {'__name__': '__main__', 'print': lambda *a, **k: None})
                problem(f"errors.json {c['id']}: CPython raised nothing")
                continue
            except Exception as e:  # noqa: BLE001
                name = type(e).__name__
                tb = e.__traceback__
                while tb.tb_next:
                    tb = tb.tb_next
                line = tb.tb_lineno
        except SyntaxError as e:
            name, line = type(e).__name__, e.lineno
        if name != KIND_TO_PY[c['kind']] or line != c['line']:
            problem(f"errors.json {c['id']}: CPython gives {name} on line {line}, fixture says {c['kind']} on line {c['line']}")


def check_sorts():
    notes = {}
    for name in ('bubble', 'merge'):
        tmpl = open(os.path.join(HERE, 'snek', 'sorts', f'{name}.snek'), encoding='utf-8').read()
        counts = {}
        for n in (100, 1000):
            src = tmpl.replace('{{N}}', str(n))
            if subset_problems(src):
                problem(f'sorts/{name}.snek outside the subset: {subset_problems(src)}')
            code, out, err = run_cpython(src)
            parts = out.split()
            if code != 0 or len(parts) != 3 or parts[2] != str(n) or int(parts[0]) > int(parts[1]):
                problem(f'sorts/{name}.snek N={n} failed: {out} {err}')
            lines = [0]

            def tr(frame, event, arg):
                if event == 'line':
                    lines[0] += 1
                return tr
            sys.settrace(lambda f, e, a: tr)
            old = sys.stdout
            sys.stdout = io.StringIO()
            try:
                exec(compile(src, '<sort>', 'exec'), {'__name__': '__main__'})
            finally:
                sys.settrace(None)
                sys.stdout = old
            counts[n] = lines[0]
        notes[name] = round(counts[1000] / counts[100], 2)
    if notes['bubble'] < 80 or notes['merge'] > 15:
        problem(f'sort fixtures do not separate under a line-count model: {notes}')
    return notes


# ---------------------------------------------------------------- packs (§13.T4 rules, CPython for Snek)
CONCEPT_RE = re.compile(r'^[a-z][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$')
ID_RE = re.compile(r'^[a-z0-9][a-z0-9-]*$')


def program_of(lines):
    return '\n'.join('    ' * l['indent'] + l['text'] for l in lines) + '\n'


def run_tests(src, entry, tests):
    """Returns the index of the first failing test, or None."""
    for i, t in enumerate(tests):
        g = {'__name__': '__main__'}
        try:
            old = sys.stdout
            sys.stdout = io.StringIO()
            try:
                exec(compile(src, '<pack>', 'exec'), g)
                got = g[entry](*t['args'])
            finally:
                sys.stdout = old
        except Exception:  # noqa: BLE001
            return i
        if got != t['expect']:
            return i
    return None


def stdout_of(code):
    rc, out, err = run_cpython(code)
    return None if rc != 0 else out.rstrip('\n')


def pack_problems(p):
    out = []
    for f in ('game', 'id', 'title', 'day', 'concepts', 'language', 'levels'):
        if f not in p:
            out.append(f'pack: missing field {f}')
    if 'id' in p and not ID_RE.match(p['id']):
        out.append(f"pack: bad id {p['id']}")
    concepts = p.get('concepts', [])
    for c in concepts:
        if not CONCEPT_RE.match(c):
            out.append(f'pack: concept {c} has the wrong format')
    ids = [str(l.get('id')) for l in p.get('levels', [])]
    for i in set(ids):
        if ids.count(i) > 1:
            out.append(f'pack: level id {i} repeated')
    for lv in p.get('levels', []):
        where = f"level {lv.get('id')}"
        for f in ('id', 'title', 'lesson'):
            if f not in lv:
                out.append(f'{where}: missing {f}')
        for card in lv.get('lesson', []):
            if len(card['text']) > 280:
                out.append(f'{where}: lesson card over 280 characters')
            if card['concept'] not in concepts:
                out.append(f"{where}: lesson concept {card['concept']} not in concepts")
        g = p.get('game')
        if g == 'syntax-drop':
            pieces = {x['id']: x for x in lv['pieces']}
            for x in lv['pieces']:
                if x['concept'] not in concepts:
                    out.append(f"{where}: piece concept {x['concept']} not in concepts")
            for s in lv['slots']:
                if not any(a in pieces and not pieces[a].get('decoy') for a in s['accepts']):
                    out.append(f"{where}: slot {s['id']} has no correct piece")
                if '{{' + s['id'] + '}}' not in lv['template']:
                    out.append(f"{where}: template has no {{{{{s['id']}}}}}")
            keys = [x['key'] for x in lv['pieces'] if 'key' in x]
            if lv['mode'] == 'strike' and (len(set(keys)) != len(keys) or any(not re.match(r'^[1-9]$', k) for k in keys)):
                out.append(f'{where}: strike keys must be unique digits 1-9')
        elif g == 'whack-a-bug':
            lines = lv['program'].split('\n')
            if len(lines) > 9:
                out.append(f'{where}: program longer than 9 lines')
            fixed = list(lines)
            for b in lv['bugs']:
                if not 1 <= b['line'] <= len(lines):
                    out.append(f"{where}: bug line {b['line']} outside the program")
                    continue
                indent = re.match(r'^\s*', lines[b['line'] - 1]).group(0)
                fixed[b['line'] - 1] = indent + b['fix']
                if b['concept'] not in concepts:
                    out.append(f"{where}: bug concept {b['concept']} not in concepts")
            a, e = stdout_of(lv['program'] + '\n'), stdout_of('\n'.join(fixed) + '\n')
            if a is None or e is None or a == e:
                out.append(f'{where}: buggy and fixed outputs must both run and differ ({a!r} vs {e!r})')
        elif g == 'aftershock':
            for order in [list(range(len(lv['lines'])))] + lv.get('altOrders', []):
                src = program_of([lv['lines'][i] for i in order])
                bad = run_tests(src, lv['entry'], lv['tests'])
                if bad is not None:
                    out.append(f'{where}: lines in order {order} fail test {bad}')
        elif g == 'sniper':
            snip = {s['id']: s for s in lv.get('snippets', [])}
            outs = {}
            for s in lv.get('snippets', []):
                o = stdout_of(s['code'] + '\n')
                if o is None:
                    out.append(f"{where}: snippet {s['id']} does not run")
                outs[s['id']] = o
                if s['concept'] not in concepts:
                    out.append(f"{where}: snippet concept {s['concept']} not in concepts")
            for b in lv.get('bounties', []):
                o = outs.get(b['snippetId'])
                if sum(1 for m in lv['monsters'] if outs.get(m) == o) != 1:
                    out.append(f"{where}: bounty {b['snippetId']} output is not printed by exactly one monster")
            for pl in lv.get('plates', []):
                if pl['snippetId'] not in snip:
                    out.append(f"{where}: plate {pl['snippetId']} unknown")
            for c in lv.get('callouts', []):
                if c not in snip:
                    out.append(f'{where}: callout {c} unknown')
    return out


def build_packs():
    own_dir = os.path.join(HERE, 'packs', 'own')
    outputs = {}
    own = []
    for g in sorted(os.listdir(own_dir)):
        for f in sorted(os.listdir(os.path.join(own_dir, g))):
            p = load(os.path.join(own_dir, g, f))
            own.append((g, f, p))
            if p['game'] != g or f != p['id'] + '.json':
                problem(f'own pack {g}/{f}: game or id does not match its path')
            for pr in pack_problems(p):
                problem(f'own pack {g}/{f}: {pr}')
            if g == 'sniper':
                for lv in p['levels']:
                    for s in lv['snippets']:
                        outputs[s['id']] = stdout_of(s['code'] + '\n')
            if g == 'aftershock':
                lv = p['levels'][0]
                swapped = [dict(l) for l in lv['lines']]
                swapped[3] = {'text': lv['decoys'][0]['text'], 'indent': 1}
                if run_tests(program_of(swapped), lv['entry'], lv['tests']) is None:
                    problem('as-area: placing the decoy must fail the tests')
    dump(os.path.join(HERE, 'packs', 'outputs.json'), {
        '_about': "stdout (trailing newline removed) of every snippet in the suite's own sniper packs, by CPython.",
        'oracle': ORACLE, 'snippets': outputs})
    idx = load(os.path.join(HERE, 'packs', 'broken', 'index.json'))['cases']
    for f, kw in idx.items():
        probs = pack_problems(load(os.path.join(HERE, 'packs', 'broken', f)))
        if not any(kw in x for x in probs):
            problem(f'broken pack {f} does not show the problem with keyword {kw!r}: {probs}')
    return own


# ---------------------------------------------------------------- package copies and seeds
def copy_package(dest, extra):
    src = os.path.join(FIX, 'package')
    if os.path.exists(dest):
        shutil.rmtree(dest)
    shutil.copytree(src, dest)
    for rel, obj in extra:
        p = os.path.join(dest, 'track1', 'games', rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        dump(p, obj)


IST = dt.timezone(dt.timedelta(hours=5, minutes=30))


def at(day, hm='10:00'):
    d = dt.date(2026, 11, 2) + dt.timedelta(days=day)
    h, m = map(int, hm.split(':'))
    return int(dt.datetime(d.year, d.month, d.day, h, m, tzinfo=IST).timestamp() * 1000)


def doc(type_, key, **fields):
    return {'type': type_, 'id': f'{type_}:{key}', 'schema': 1, 'updatedAt': at(0, '08:00'), 'updatedBy': 'hub:seed', **fields}


def result(person, key, gameId, packId, levelId, score, skill, stars, xp, coins, at_ms, claimed=0, mistakes=None):
    return doc('gameResult', key, personId=f'person:{person}', classId='class:c1', gameId=gameId, packId=packId,
               levelId=levelId, score=score, stars=stars, knowledgeStars=stars, skill=skill, outcome='won', xp=xp,
               coins=coins, claimed=claimed, assisted=0, mistakes=mistakes or [], assist=False, durationMs=60000,
               at=at_ms, seed=7)


def player(person, xp=0, coins=0, gear=None, purchases=None, seen=None):
    return doc('player', person, xp=xp, coins=coins, cosmetics=[], gear=gear or [], purchases=purchases or [],
               seen=seen or {'prologue': False, 'intro': {}, 'scenes': {}},
               avatar={'look': 'block', 'color': 'teal', 'nameTag': person}, timingOffsetMs=0,
               settings={'autoAdvance': False})


GEAR = ['scope-zoom', 'stabilizer', 'suppressor', 'rangefinder', 'wide', 'heavy', 'quick', 'scarecrow', 'double-jump', 'dash', 'boots']


def build_seeds():
    base = load(os.path.join(FIX, 'journeys', 'base.json'))
    out = os.path.join(HERE, 'seeds')
    os.makedirs(out, exist_ok=True)
    fmt = base.get('_format')

    def variant(name, about, switches=None, package='games/package'):
        s = copy.deepcopy(base)
        s['_about'] = about
        s['packages'] = [{'path': package, 'classId': 'class:c1', 'publish': True}]
        if switches is not None:
            for d in s['databases']['class-c1']:
                if d['type'] == 'class':
                    d['switches'] = switches
        dump(os.path.join(out, f'{name}.json'), s)
    variant('games-base', 'As journeys/base.json, but the published package is games/package: the v1 fixture package plus '
            "the suite's own game packs (sd-fill, sd-strike, sd-rhythm, wb-loops, as-area, sn-basics on day 0; sd-later on day 2).")
    variant('games-off', 'As games-base, with class c1 switches { games: false } (AC-204).', {'games': False})
    variant('games-one-off', "As games-base, with class c1 switches { 'game.whackABug': false } (AC-204).", {'game.whackABug': False})

    def additive(name, about, dbs, **extra):
        dump(os.path.join(out, f'{name}.json'), {'_format': fmt, '_about': about, 'databases': dbs, **extra})
    additive('games-privacy', 'Additive (AC-206): game results and players for l1, l2, l3. l2 scored 98765 (xp 4320), l3 '
             'scored 87654 (xp 3000), l1 has xp 1000. team-a (l1, l2) average xp = 2660; team-b (l3) = 3000.', {
                 'person-l1': [result('l1', 'l1-seed-1', 'whack-a-bug', 'wb-loops', '1', 1234, 1134, 3, 1000, 15, at(0, '09:30')),
                               player('l1', xp=1000, coins=15)],
                 'person-l2': [result('l2', 'l2-seed-1', 'whack-a-bug', 'wb-loops', '1', 98765, 98665, 3, 4320, 15, at(0, '09:31')),
                               player('l2', xp=4320, coins=15)],
                 'person-l3': [result('l3', 'l3-seed-1', 'sniper', 'sn-basics', '1', 87654, 87354, 3, 3000, 15, at(0, '09:32')),
                               player('l3', xp=3000, coins=15)]})
    additive('games-samples', 'Additive (D-G18): every builder sample pack (packages/games/packs) imported into class c1 '
             'from day 0.', {}, samplePacks=[{'classId': 'class:c1', 'day': 0}])
    additive('games-sniper-rank', "Additive: l1 claimed 6 bounties in sniper/boss-recursion and 6 in sniper/sn-basics, so "
             'l1 is Sharpshooter in both and their boss levels are unlocked (AC-201, AC-203).', {
                 'person-l1': [result('l1', 'l1-rank-1', 'sniper', 'boss-recursion', '1', 300, 200, 3, 80, 15, at(0, '09:40'), claimed=6),
                               result('l1', 'l1-rank-2', 'sniper', 'sn-basics', '1', 300, 200, 3, 80, 15, at(0, '09:41'), claimed=6),
                               player('l1', xp=160, coins=30)]})
    additive('games-player', 'Additive (AC-236, AC-237): l1 has two results worth xp 120 + 80 = 200 and coins 40 + 25 = 65; '
             'the player document holds those totals and no purchases.', {
                 'person-l1': [result('l1', 'l1-p-1', 'whack-a-bug', 'wb-loops', '1', 500, 400, 3, 120, 40, at(0, '09:35')),
                               result('l1', 'l1-p-2', 'aftershock', 'as-area', '1', 300, 200, 2, 80, 25, at(0, '09:36')),
                               player('l1', xp=200, coins=65)]})
    additive('games-gear', 'Additive (AC-238): l1 owns every first-wave gear item (bought for 0 coins in this seed).', {
        'person-l1': [player('l1', gear=GEAR, purchases=[{'itemId': g, 'price': 0, 'at': at(0, '08:30')} for g in GEAR])]})
    additive('games-seen', 'Additive: l1 has seen the prologue and every first-wave intro (AC-232 second launches).', {
        'person-l1': [player('l1', seen={'prologue': True, 'intro': {g: True for g in ('syntax-drop', 'sniper', 'whack-a-bug', 'aftershock')}, 'scenes': {}})]})


def main():
    n, excluded = build_corpus()
    build_step()
    check_errors()
    notes = check_sorts()
    own = build_packs()
    copy_package(os.path.join(HERE, 'package'), [(f'{g}/{f}', p) for g, f, p in own])
    broken = load(os.path.join(HERE, 'packs', 'broken', 'missing-title.json'))
    copy_package(os.path.join(HERE, 'package-broken'), [(f"syntax-drop/{broken['id']}.json", broken)])
    build_seeds()
    print(f'oracle {ORACLE}; corpus {n} programs ({len(excluded)} excluded); sort line-count ratios {notes}')
    if PROBLEMS:
        print(f'{len(PROBLEMS)} problem(s)', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
