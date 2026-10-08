# The AC-208 Snek corpus: 120 programs inside the Snek subset (SPEC-games G4 + games contract §13.T3).
# Expected stdout is computed by build_fixtures.py with real CPython 3.14 (python3 -I), never by hand.
# Each entry: (id, tags, source) or (id, tags, source, input_lines).
# Rules kept by every program: no set is printed or iterated where order matters; no exception object is
# printed; no %-formatting or str.format; ints stay within +-(2**53 - 1); no generators, with, global.

P = []
def add(pid, tags, src, inp=None):
    P.append((pid, tags, src.strip('\n') + '\n', inp))

# ---------- numbers and operators ----------
add('num-01', 'int arithmetic', '''
a = 17
b = 5
print(a + b, a - b, a * b)
print(a // b, a % b, a ** 2)
print(-a // b, -a % b)
''')
add('num-02', 'float division repr', '''
print(7 / 2)
print(6 / 3)
print(1 / 3)
print(0.1 + 0.2)
''')
add('num-03', 'float repr exponent', '''
print(1e16)
print(1e15)
print(0.0001)
print(0.00001)
print(123456789.0 * 1000)
''')
add('num-04', 'round abs', '''
print(round(2.5), round(3.5), round(-2.5))
print(round(3.14159, 2))
print(abs(-7), abs(2.5))
''')
add('num-05', 'conversions', '''
print(int("42") + 1)
print(int(3.99), int(-3.99))
print(float("2.5") * 2)
print(str(10) + "!")
print(bool(0), bool(3), bool(""), bool("x"))
''')
add('num-06', 'chained comparison bool ops', '''
x = 5
print(1 < x < 10, 1 < x > 7)
print(x > 3 and x < 4, x > 3 or x < 4, not x)
print(3 == 3.0, 2 != 2)
''')
add('num-07', 'augmented assignment', '''
n = 10
n += 5
n -= 3
n *= 2
n //= 5
n %= 3
print(n)
f = 1.5
f /= 2
print(f)
''')
add('num-08', 'chained assignment is', '''
a = b = 0
a += 1
print(a, b)
x = None
print(x is None, x is not None)
''')
add('num-09', 'min max sum', '''
xs = [4, 8, 15, 16, 23, 42]
print(min(xs), max(xs), sum(xs))
print(max(3, 9, 1), min(2.5, 1.5))
print(sum([]))
''')
add('num-10', 'math module', '''
import math
print(math.floor(3.7), math.ceil(3.2))
print(math.sqrt(16), math.sqrt(2))
print(math.inf > 10 ** 15)
print(-math.inf < 0)
''')
add('num-11', 'power precedence unary', '''
print(-2 ** 2)
print((-2) ** 2)
print(2 ** 10)
print(2 ** -1)
''')
add('num-13', 'conditional expression', '''
for n in [-4, 0, 7]:
    sign = "negative" if n < 0 else "zero" if n == 0 else "positive"
    print(n, sign, abs(n) if n < 0 else n)
print([x if x % 2 == 0 else -x for x in range(6)])
''')
add('num-12', 'ord chr', '''
print(ord("A"), ord("a"))
print(chr(72) + chr(105))
word = ""
for code in range(97, 102):
    word += chr(code)
print(word)
''')

# ---------- strings ----------
add('str-01', 'indexing slicing', '''
s = "abcdefgh"
print(s[0], s[-1], s[2:5], s[:3], s[5:])
print(s[::2], s[::-1], s[1:7:3])
''')
add('str-02', 'methods case', '''
s = "Hello World"
print(s.upper())
print(s.lower())
print(s.replace("World", "Snek"))
print(s.find("o"), s.find("z"))
''')
add('str-03', 'split join strip', '''
line = "  red, green ,blue  "
parts = [p.strip() for p in line.strip().split(",")]
print(parts)
print("-".join(parts))
print("a b  c".split())
''')
add('str-04', 'startswith endswith isdigit isalpha', '''
for w in ["abc", "123", "a1", "Snek"]:
    print(w, w.isdigit(), w.isalpha(), w.startswith("a"), w.endswith("k"))
''')
add('str-05', 'concat repeat len in', '''
s = "ab" * 3
print(s, len(s))
print("ba" in s, "c" in s)
print("=" * 10)
''')
add('str-06', 'fstring basic', '''
name = "Ada"
age = 36
print(f"{name} is {age} years old")
print(f"{age + 1} next year, {name.upper()}")
''')
add('str-07', 'fstring specs', '''
price = 3.14159
n = 42
print(f"{price:.2f}")
print(f"[{n:>5}]")
print(f"[{'ab':<5}]")
print(f"{n:d}")
print(f"[{7:>3}][{'x':<3}]")
''')
add('str-08', 'fstring table', '''
rows = [("apple", 1.5), ("kiwi", 0.25), ("melon", 3.0)]
for name, cost in rows:
    print(f"{name:<8}{cost:.2f}")
''')
add('str-09', 'count vowels', '''
text = "programming is fun"
count = 0
for ch in text:
    if ch in "aeiou":
        count += 1
print(count)
''')
add('str-10', 'palindromes', '''
def is_pal(w):
    w = w.lower()
    return w == w[::-1]
for w in ["Level", "snek", "noon", "abca"]:
    print(w, is_pal(w))
''')
add('str-11', 'reverse words', '''
sentence = "the quick brown fox"
words = sentence.split(" ")
print(" ".join(reversed(words)))
print(" ".join([w[::-1] for w in words]))
''')
add('str-12', 'caesar', '''
def shift(text, k):
    out = ""
    for ch in text:
        if ch.isalpha():
            out += chr((ord(ch) - 97 + k) % 26 + 97)
        else:
            out += ch
    return out
print(shift("hello world", 3))
print(shift(shift("snek", 5), -5))
''')
add('str-13', 'str repr in containers', '''
print(["a", "b'c", 'd"e'])
print(("x", 1))
print({"k": "v"})
print(str([1, "2"]))
''')
add('str-14', 'char frequency dict', '''
freq = {}
for ch in "mississippi":
    freq[ch] = freq.get(ch, 0) + 1
print(freq)
print(sorted(freq.items()))
''')
add('str-15', 'input and strings', '''
name = input("Name? ")
times = int(input())
print()
print(f"Hi {name}! " * times)
''', ['Kit', '2'])

# ---------- lists ----------
add('list-01', 'methods', '''
xs = [3, 1, 2]
xs.append(5)
xs.insert(0, 9)
xs.extend([7, 7])
print(xs)
print(xs.pop(), xs.pop(0), xs)
xs.remove(7)
print(xs, xs.index(2), xs.count(1))
''')
add('list-02', 'sort reverse', '''
xs = [5, 2, 8, 1]
xs.sort()
print(xs)
xs.reverse()
print(xs)
print(sorted(["pear", "fig", "apple"]))
print(sorted(["pear", "fig", "apple"], key=len))
print(sorted([3, 1, 2], reverse=True))
''')
add('list-03', 'slicing negative del', '''
xs = list(range(10))
print(xs[-3:], xs[:-7], xs[2:8:2])
del xs[0]
del xs[-1]
print(xs)
ys = xs[:]
ys[0] = 100
print(xs[0], ys[0])
''')
add('list-04', 'comprehensions', '''
sq = [x * x for x in range(6)]
ev = [x for x in sq if x % 2 == 0]
print(sq)
print(ev)
print([c.upper() for c in "abc"])
''')
add('list-05', 'enumerate zip', '''
names = ["a", "b", "c"]
for i, n in enumerate(names):
    print(i, n)
for n, k in zip(names, [10, 20, 30]):
    print(n, k)
print(list(zip([1, 2], [3, 4])))
''')
add('list-06', 'map filter lambda', '''
nums = [1, 2, 3, 4, 5, 6]
print(list(map(lambda x: x * 10, nums)))
print(list(filter(lambda x: x % 3 == 0, nums)))
double = lambda x: x * 2
print(double(21))
''')
add('list-07', 'any all', '''
xs = [2, 4, 6, 7]
print(any([x > 6 for x in xs]), all([x % 2 == 0 for x in xs]))
print(any([]), all([]))
''')
add('list-08', 'nested lists matrix', '''
m = [[1, 2, 3], [4, 5, 6]]
t = [[m[r][c] for r in range(2)] for c in range(3)]
print(t)
total = 0
for row in m:
    for v in row:
        total += v
print(total)
''')
add('list-09', 'swap unpacking', '''
a, b = 1, 2
a, b = b, a
print(a, b)
xs = [1, 2, 3]
xs[0], xs[2] = xs[2], xs[0]
print(xs)
first, second, third = xs
print(second)
''')
add('list-10', 'list equality membership', '''
print([1, 2] == [1, 2], [1, 2] == [2, 1])
print(3 in [1, 2, 3], 4 not in [1, 2, 3])
print([1, 2] + [3], [0] * 4)
print(len([[], [1]]))
''')
add('list-11', 'reversed list()', '''
print(list(reversed([1, 2, 3])))
print(list("abc"))
print(list(range(5, 0, -2)))
''')
add('list-12', 'running max', '''
data = [3, 7, 2, 9, 4, 9, 1]
best = data[0]
out = []
for v in data:
    if v > best:
        best = v
    out.append(best)
print(out)
''')
add('list-13', 'sorted tuples key', '''
people = [("ann", 31), ("bob", 25), ("cy", 31), ("dee", 19)]
print(sorted(people, key=lambda p: p[1]))
print(sorted(people, key=lambda p: p[1], reverse=True)[0])
''')
add('list-14', 'flatten', '''
nested = [[1, 2], [3], [], [4, 5, 6]]
flat = []
for part in nested:
    flat.extend(part)
print(flat, len(flat))
''')
add('list-15', 'stack with list', '''
stack = []
for ch in "abc":
    stack.append(ch)
out = ""
while stack:
    out += stack.pop()
print(out)
''')

# ---------- dicts, sets, tuples ----------
add('dict-01', 'basic', '''
d = {"a": 1, "b": 2}
d["c"] = 3
print(d, len(d))
print(d["b"], d.get("z"), d.get("z", 0))
print("a" in d, "z" in d)
''')
add('dict-02', 'iterate items keys values', '''
d = {"x": 10, "y": 20, "z": 30}
for k, v in d.items():
    print(k, v)
print(list(d.keys()), list(d.values()))
print(sum(d.values()))
''')
add('dict-03', 'setdefault pop del', '''
groups = {}
for w in ["apple", "avocado", "banana", "blueberry", "cherry"]:
    groups.setdefault(w[0], []).append(w)
print(groups)
print(groups.pop("c"), groups)
del groups["a"]
print(groups)
''')
add('dict-04', 'comprehension', '''
sq = {n: n * n for n in range(5)}
print(sq)
inv = {v: k for k, v in sq.items() if v > 3}
print(inv)
''')
add('dict-05', 'word count', '''
text = "the cat and the hat and the bat"
counts = {}
for w in text.split():
    counts[w] = counts.get(w, 0) + 1
best = sorted(counts.items(), key=lambda kv: kv[1], reverse=True)[0]
print(counts)
print(best)
''')
add('dict-06', 'nested dict', '''
grades = {"ann": {"math": 90, "art": 75}, "bob": {"math": 60, "art": 95}}
for name in sorted(grades):
    g = grades[name]
    print(name, max(g, key=lambda k: g[k]), sum(g.values()) / len(g))
''')
add('dict-07', 'two sum', '''
def two_sum(nums, target):
    seen = {}
    for i, n in enumerate(nums):
        if target - n in seen:
            return [seen[target - n], i]
        seen[n] = i
    return None
print(two_sum([2, 7, 11, 15], 9))
print(two_sum([3, 2, 4], 6))
print(two_sum([1, 2], 7))
''')
add('dict-08', 'dict tuple keys', '''
grid = {}
for r in range(2):
    for c in range(3):
        grid[(r, c)] = r * 3 + c
print(grid[(1, 2)], len(grid))
print((0, 1) in grid, (5, 5) in grid)
''')
add('set-01', 'membership size', '''
s = set([3, 1, 3, 2, 1])
print(len(s), 2 in s, 5 in s)
s.add(5)
s.discard(1)
s.discard(100)
s.remove(3)
print(sorted(s))
''')
add('set-02', 'dedupe sorted', '''
words = ["b", "a", "c", "a", "b"]
print(sorted(set(words)))
print(len({w for w in words}))
''')
add('set-03', 'set comprehension', '''
mods = {n % 4 for n in range(20)}
print(sorted(mods), len(mods))
''')
add('set-04', 'seen loop', '''
seen = set()
dups = []
for x in [4, 1, 4, 2, 1, 4]:
    if x in seen:
        dups.append(x)
    seen.add(x)
print(dups)
''')
add('tuple-01', 'tuples', '''
t = (1, 2, 3)
print(t, t[1], t[-1], len(t))
print(t + (4,), (5,) * 2)
a, b, c = t
print(a + b + c)
print(tuple([7, 8]))
''')
add('tuple-02', 'tuple return', '''
def min_max(xs):
    return min(xs), max(xs)
lo, hi = min_max([5, 3, 9, 1])
print(lo, hi)
print(min_max([2]))
''')
add('tuple-03', 'isinstance', '''
for v in [1, 2.0, "s", [1], (1,), {"a": 1}, True, None]:
    print(isinstance(v, int), isinstance(v, str), isinstance(v, list))
''')

# ---------- control flow ----------
add('flow-01', 'if elif else', '''
for n in [0, 5, 15, -3]:
    if n < 0:
        print("negative")
    elif n == 0:
        print("zero")
    elif n < 10:
        print("small")
    else:
        print("big")
''')
add('flow-02', 'while break continue', '''
i = 0
total = 0
while True:
    i += 1
    if i % 2 == 0:
        continue
    if i > 9:
        break
    total += i
print(i, total)
''')
add('flow-03', 'fizzbuzz', '''
for i in range(1, 16):
    if i % 15 == 0:
        print("FizzBuzz")
    elif i % 3 == 0:
        print("Fizz")
    elif i % 5 == 0:
        print("Buzz")
    else:
        print(i)
''')
add('flow-04', 'nested loops break', '''
found = None
for a in range(1, 20):
    for b in range(a, 20):
        if a * a + b * b == 13 * 13:
            found = (a, b)
            break
    if found:
        break
print(found)
''')
add('flow-05', 'pass and print sep end', '''
for i in range(3):
    pass
print("a", "b", "c", sep="-")
print("no newline", end="")
print(" then newline")
print(1, 2, sep="", end="!\\n")
''')
add('flow-06', 'collatz', '''
n = 27
steps = 0
peak = n
while n != 1:
    if n % 2 == 0:
        n = n // 2
    else:
        n = 3 * n + 1
    peak = max(peak, n)
    steps += 1
print(steps, peak)
''')
add('flow-07', 'range variants', '''
print(list(range(5)))
print(list(range(2, 9, 3)))
print(list(range(10, 0, -3)))
print(len(range(0, 100, 7)))
''')
add('flow-08', 'digit sum input', '''
n = int(input("number: "))
s = 0
while n > 0:
    s += n % 10
    n //= 10
print(s)
''', ['98765'])

# ---------- patterns ----------
add('pat-01', 'right triangle', '''
for i in range(1, 6):
    print("*" * i)
''')
add('pat-02', 'pyramid', '''
n = 4
for i in range(n):
    print(" " * (n - i - 1) + "*" * (2 * i + 1))
''')
add('pat-03', 'number triangle', '''
for i in range(1, 5):
    row = ""
    for j in range(1, i + 1):
        row += str(j)
    print(row)
''')
add('pat-04', 'hollow square', '''
n = 5
for r in range(n):
    if r == 0 or r == n - 1:
        print("#" * n)
    else:
        print("#" + " " * (n - 2) + "#")
''')
add('pat-05', 'diamond', '''
n = 3
rows = []
for i in range(n):
    rows.append(" " * (n - i - 1) + "*" * (2 * i + 1))
for r in rows + rows[-2::-1]:
    print(r)
''')
add('pat-06', 'checkerboard', '''
for r in range(4):
    print("".join(["#" if (r + c) % 2 == 0 else "." for c in range(6)]))
''')
add('pat-07', 'multiplication table', '''
for a in range(1, 4):
    print(" ".join([f"{a * b:>3}" for b in range(1, 6)]))
''')

# ---------- functions and recursion ----------
add('fn-01', 'defaults keyword args', '''
def greet(name, greeting="Hello", mark="!"):
    return greeting + ", " + name + mark
print(greet("Ada"))
print(greet("Kit", "Hi"))
print(greet("Mo", mark="?"))
print(greet(greeting="Yo", name="Rook"))
''')
add('fn-02', 'factorial recursion', '''
def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)
print([fact(i) for i in range(8)])
print(fact(15))
''')
add('fn-03', 'fibonacci memo', '''
memo = {}
def fib(n):
    if n < 2:
        return n
    if n in memo:
        return memo[n]
    memo[n] = fib(n - 1) + fib(n - 2)
    return memo[n]
print(fib(30), fib(60))
''')
add('fn-04', 'gcd lcm', '''
def gcd(a, b):
    while b:
        a, b = b, a % b
    return a
def lcm(a, b):
    return a * b // gcd(a, b)
print(gcd(84, 36), lcm(4, 6), gcd(17, 5))
''')
add('fn-05', 'hanoi count', '''
moves = []
def hanoi(n, a, b, c):
    if n == 0:
        return
    hanoi(n - 1, a, c, b)
    moves.append(a + c)
    hanoi(n - 1, b, a, c)
hanoi(3, "A", "B", "C")
print(len(moves), moves[:4])
''')
add('fn-06', 'power set recursion', '''
def subsets(xs):
    if not xs:
        return [[]]
    rest = subsets(xs[1:])
    return rest + [[xs[0]] + r for r in rest]
print(sorted(subsets([1, 2, 3])))
''')
add('fn-07', 'permutations', '''
def perms(s):
    if len(s) <= 1:
        return [s]
    out = []
    for i in range(len(s)):
        for p in perms(s[:i] + s[i + 1:]):
            out.append(s[i] + p)
    return out
print(perms("abc"))
''')
add('fn-08', 'higher order', '''
def apply_twice(f, x):
    return f(f(x))
def add3(x):
    return x + 3
print(apply_twice(add3, 10))
print(apply_twice(lambda s: s + s, "ab"))
''')
add('fn-09', 'closure-free counter via list', '''
def make_counter():
    count = [0]
    def inc():
        count[0] += 1
        return count[0]
    return inc
c = make_counter()
c()
c()
print(c())
''')
add('fn-10', 'none return', '''
def nothing():
    pass
def maybe(x):
    if x > 0:
        return x
print(nothing(), maybe(3), maybe(-1))
print(maybe(-1) is None)
''')
add('fn-11', 'binary search', '''
def bsearch(xs, target):
    lo, hi = 0, len(xs) - 1
    while lo <= hi:
        mid = (lo + hi) // 2
        if xs[mid] == target:
            return mid
        if xs[mid] < target:
            lo = mid + 1
        else:
            hi = mid - 1
    return -1
data = [1, 3, 5, 7, 9, 11]
print([bsearch(data, t) for t in [1, 7, 11, 4]])
''')
add('fn-12', 'is prime sieve', '''
def primes(n):
    flags = [True] * (n + 1)
    flags[0] = flags[1] = False
    for i in range(2, n + 1):
        if flags[i]:
            for j in range(i * i, n + 1, i):
                flags[j] = False
    return [i for i in range(n + 1) if flags[i]]
print(primes(40))
''')

# ---------- classes ----------
add('cls-01', 'class attributes methods', '''
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y
    def dist2(self, other):
        return (self.x - other.x) ** 2 + (self.y - other.y) ** 2
a = Point(0, 0)
b = Point(3, 4)
print(a.dist2(b), b.x, b.y)
b.x = 10
print(b.x)
''')
add('cls-02', 'stack class', '''
class Stack:
    def __init__(self):
        self.items = []
    def push(self, x):
        self.items.append(x)
    def pop(self):
        return self.items.pop()
    def is_empty(self):
        return len(self.items) == 0
s = Stack()
for c in "([{":
    s.push(c)
print(s.pop(), s.pop(), s.is_empty(), s.pop(), s.is_empty())
''')
add('cls-03', 'balanced brackets', '''
def balanced(text):
    pairs = {")": "(", "]": "[", "}": "{"}
    stack = []
    for ch in text:
        if ch in "([{":
            stack.append(ch)
        elif ch in pairs:
            if not stack or stack.pop() != pairs[ch]:
                return False
    return not stack
for t in ["([]{})", "([)]", "((", "a(b)c"]:
    print(t, balanced(t))
''')
add('cls-04', 'linked list', '''
class Node:
    def __init__(self, value, next=None):
        self.value = value
        self.next = next
head = None
for v in [3, 2, 1]:
    head = Node(v, head)
out = []
node = head
while node:
    out.append(node.value)
    node = node.next
print(out)
''')
add('cls-05', 'reverse linked list', '''
class Node:
    def __init__(self, value):
        self.value = value
        self.next = None
nodes = [Node(i) for i in range(5)]
for a, b in zip(nodes, nodes[1:]):
    a.next = b
prev = None
cur = nodes[0]
while cur:
    nxt = cur.next
    cur.next = prev
    prev = cur
    cur = nxt
vals = []
while prev:
    vals.append(prev.value)
    prev = prev.next
print(vals)
''')
add('cls-06', 'bst insert inorder', '''
class Tree:
    def __init__(self, key):
        self.key = key
        self.left = None
        self.right = None
def insert(t, k):
    if t is None:
        return Tree(k)
    if k < t.key:
        t.left = insert(t.left, k)
    else:
        t.right = insert(t.right, k)
    return t
def inorder(t, out):
    if t:
        inorder(t.left, out)
        out.append(t.key)
        inorder(t.right, out)
    return out
root = None
for k in [50, 30, 70, 20, 40, 60, 80, 35]:
    root = insert(root, k)
print(inorder(root, []))
''')
add('cls-07', 'tree height', '''
class T:
    def __init__(self, left=None, right=None):
        self.left = left
        self.right = right
def height(t):
    if t is None:
        return 0
    return 1 + max(height(t.left), height(t.right))
tree = T(T(T(), None), T(None, T(T(), T())))
print(height(tree))
''')
add('cls-08', 'bank account', '''
class Account:
    def __init__(self, owner, balance=0):
        self.owner = owner
        self.balance = balance
        self.log = []
    def deposit(self, amount):
        self.balance += amount
        self.log.append(("in", amount))
    def withdraw(self, amount):
        if amount > self.balance:
            return False
        self.balance -= amount
        self.log.append(("out", amount))
        return True
a = Account("Mo", 10)
a.deposit(15)
print(a.withdraw(30), a.withdraw(5), a.balance, a.log)
''')
add('cls-09', 'queue class two stacks', '''
class Queue:
    def __init__(self):
        self.inbox = []
        self.outbox = []
    def put(self, x):
        self.inbox.append(x)
    def get(self):
        if not self.outbox:
            while self.inbox:
                self.outbox.append(self.inbox.pop())
        return self.outbox.pop()
q = Queue()
for i in range(3):
    q.put(i)
print(q.get(), q.get())
q.put(9)
print(q.get(), q.get())
''')
add('cls-10', 'objects in list sorted key', '''
class Item:
    def __init__(self, name, price):
        self.name = name
        self.price = price
items = [Item("pen", 2.5), Item("book", 12.0), Item("cup", 4.25)]
for it in sorted(items, key=lambda i: i.price):
    print(f"{it.name:<6}{it.price:.2f}")
''')

# ---------- exceptions ----------
add('exc-01', 'value error', '''
for s in ["12", "x", "7"]:
    try:
        print(int(s) * 2)
    except ValueError:
        print("not a number:", s)
''')
add('exc-02', 'zero division', '''
def safe_div(a, b):
    try:
        return a / b
    except ZeroDivisionError:
        return None
print(safe_div(6, 3), safe_div(1, 0))
''')
add('exc-03', 'key index errors', '''
d = {"a": 1}
try:
    print(d["b"])
except KeyError:
    print("missing key")
xs = [1, 2]
try:
    print(xs[5])
except IndexError:
    print("bad index")
''')
add('exc-04', 'raise caught', '''
def check_age(n):
    if n < 0:
        raise ValueError("negative age")
    return n
for v in [5, -1]:
    try:
        print(check_age(v))
    except ValueError as e:
        print("rejected", v)
''')
add('exc-05', 'assert caught', '''
def half(n):
    assert n % 2 == 0, "odd"
    return n // 2
for v in [8, 3]:
    try:
        print(half(v))
    except AssertionError:
        print("assert failed for", v)
''')
add('exc-06', 'except exception', '''
results = []
for thing in [1, "a", None]:
    try:
        results.append(thing + 1)
    except Exception:
        results.append("err")
print(results)
''')
add('exc-07', 'bare except', '''
def risky(i):
    if i == 2:
        raise KeyError("two")
    return i * 10
out = []
for i in range(4):
    try:
        out.append(risky(i))
    except:
        out.append(-1)
print(out)
''')
add('exc-08', 'raise class no message', '''
def pick(xs, i):
    if i >= len(xs):
        raise IndexError
    return xs[i]
try:
    pick([1], 3)
except IndexError:
    print("caught IndexError")
''')

# ---------- modules: deque, heapq ----------
add('mod-01', 'deque basics', '''
from collections import deque
q = deque([1, 2, 3])
q.append(4)
q.appendleft(0)
print(q.popleft(), q.pop(), len(q))
print(list(q))
''')
add('mod-02', 'deque bfs grid', '''
from collections import deque
grid = ["..#.", ".##.", "....", "#..."]
start = (0, 0)
goal = (3, 3)
dist = {start: 0}
q = deque([start])
while q:
    r, c = q.popleft()
    for dr, dc in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
        nr, nc = r + dr, c + dc
        if 0 <= nr < 4 and 0 <= nc < 4 and grid[nr][nc] == "." and (nr, nc) not in dist:
            dist[(nr, nc)] = dist[(r, c)] + 1
            q.append((nr, nc))
print(dist.get(goal))
''')
add('mod-03', 'heapq basics', '''
import heapq
h = []
for v in [5, 1, 8, 3, 2]:
    heapq.heappush(h, v)
out = []
while h:
    out.append(heapq.heappop(h))
print(out)
''')
add('mod-04', 'heapify', '''
import heapq
xs = [9, 4, 7, 1, 8]
heapq.heapify(xs)
print(xs[0], heapq.heappop(xs), heapq.heappop(xs), len(xs))
''')
add('mod-05', 'dijkstra', '''
import heapq
graph = {"a": [("b", 4), ("c", 1)], "b": [("d", 1)], "c": [("b", 2), ("d", 5)], "d": []}
dist = {"a": 0}
pq = [(0, "a")]
while pq:
    d, node = heapq.heappop(pq)
    if d > dist.get(node, 10 ** 9):
        continue
    for nxt, w in graph[node]:
        nd = d + w
        if nd < dist.get(nxt, 10 ** 9):
            dist[nxt] = nd
            heapq.heappush(pq, (nd, nxt))
print(sorted(dist.items()))
''')
add('mod-06', 'graph bfs order', '''
from collections import deque
graph = {1: [2, 3], 2: [4], 3: [4, 5], 4: [6], 5: [6], 6: []}
seen = [1]
q = deque([1])
while q:
    n = q.popleft()
    for m in graph[n]:
        if m not in seen:
            seen.append(m)
            q.append(m)
print(seen)
''')
add('mod-07', 'dfs recursion', '''
graph = {"a": ["b", "c"], "b": ["d"], "c": ["d", "e"], "d": [], "e": []}
order = []
def dfs(n):
    if n in order:
        return
    order.append(n)
    for m in graph[n]:
        dfs(m)
dfs("a")
print(order)
''')
add('mod-08', 'k smallest heap', '''
import heapq
data = [15, 3, 9, 27, 1, 8]
h = []
for x in data:
    heapq.heappush(h, -x)
    if len(h) > 3:
        heapq.heappop(h)
print(sorted([-v for v in h]))
''')
add('mod-09', 'math in loop', '''
import math
for n in [1, 2, 10, 99]:
    r = math.sqrt(n)
    print(n, math.floor(r), math.ceil(r), f"{r:.2f}")
''')
add('mod-10', 'deque sliding window max', '''
from collections import deque
nums = [1, 3, -1, -3, 5, 3, 6, 7]
k = 3
dq = deque()
out = []
for i, v in enumerate(nums):
    while dq and nums[dq[-1]] <= v:
        dq.pop()
    dq.append(i)
    if dq[0] <= i - k:
        dq.popleft()
    if i >= k - 1:
        out.append(nums[dq[0]])
print(out)
''')

# ---------- algorithms ----------
add('alg-01', 'bubble sort', '''
def bubble(xs):
    xs = xs[:]
    n = len(xs)
    for i in range(n):
        for j in range(n - 1 - i):
            if xs[j] > xs[j + 1]:
                xs[j], xs[j + 1] = xs[j + 1], xs[j]
    return xs
print(bubble([5, 2, 9, 1, 5, 6]))
''')
add('alg-02', 'insertion sort', '''
def insertion(xs):
    for i in range(1, len(xs)):
        key = xs[i]
        j = i - 1
        while j >= 0 and xs[j] > key:
            xs[j + 1] = xs[j]
            j -= 1
        xs[j + 1] = key
    return xs
print(insertion([4, 3, 2, 10, 12, 1, 5, 6]))
''')
add('alg-03', 'merge sort', '''
def merge_sort(xs):
    if len(xs) <= 1:
        return xs
    mid = len(xs) // 2
    left = merge_sort(xs[:mid])
    right = merge_sort(xs[mid:])
    out = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            out.append(left[i])
            i += 1
        else:
            out.append(right[j])
            j += 1
    return out + left[i:] + right[j:]
print(merge_sort([38, 27, 43, 3, 9, 82, 10]))
''')
add('alg-04', 'quick sort', '''
def qs(xs):
    if len(xs) <= 1:
        return xs
    p = xs[0]
    return qs([x for x in xs[1:] if x < p]) + [p] + qs([x for x in xs[1:] if x >= p])
print(qs([3, 6, 1, 8, 2, 9, 2]))
''')
add('alg-05', 'prefix sums', '''
xs = [2, 4, 1, 5, 3]
pre = [0]
for x in xs:
    pre.append(pre[-1] + x)
print(pre)
print(pre[4] - pre[1])
''')
add('alg-06', 'sliding window sum', '''
def best_window(xs, k):
    s = sum(xs[:k])
    best = s
    for i in range(k, len(xs)):
        s += xs[i] - xs[i - k]
        best = max(best, s)
    return best
print(best_window([1, 4, 2, 10, 23, 3, 1, 0, 20], 4))
''')
add('alg-07', 'two pointers pair sum', '''
def pair_sum(xs, target):
    i, j = 0, len(xs) - 1
    while i < j:
        s = xs[i] + xs[j]
        if s == target:
            return (xs[i], xs[j])
        if s < target:
            i += 1
        else:
            j -= 1
    return None
print(pair_sum([1, 2, 4, 7, 11, 15], 15), pair_sum([1, 2, 3], 10))
''')
add('alg-08', 'dp coin change', '''
def coins(amount, cs):
    INF = 10 ** 9
    dp = [0] + [INF] * amount
    for a in range(1, amount + 1):
        for c in cs:
            if c <= a and dp[a - c] + 1 < dp[a]:
                dp[a] = dp[a - c] + 1
    return dp[amount] if dp[amount] < INF else -1
print(coins(11, [1, 2, 5]), coins(3, [2]), coins(0, [1]))
''')
add('alg-09', 'dp lcs', '''
def lcs(a, b):
    m, n = len(a), len(b)
    t = [[0] * (n + 1) for _ in range(m + 1)]
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if a[i - 1] == b[j - 1]:
                t[i][j] = t[i - 1][j - 1] + 1
            else:
                t[i][j] = max(t[i - 1][j], t[i][j - 1])
    return t[m][n]
print(lcs("snake", "stack"), lcs("abc", "abc"), lcs("", "x"))
''')
add('alg-10', 'anagram groups', '''
words = ["eat", "tea", "tan", "ate", "nat", "bat"]
groups = {}
for w in words:
    key = "".join(sorted(w))
    groups.setdefault(key, []).append(w)
print(sorted([sorted(g) for g in groups.values()]))
''')
add('alg-11', 'run length', '''
def rle(s):
    out = ""
    i = 0
    while i < len(s):
        j = i
        while j < len(s) and s[j] == s[i]:
            j += 1
        out += s[i] + str(j - i)
        i = j
    return out
print(rle("aaabccdddd"), rle(""), rle("x"))
''')
add('alg-12', 'binary conversion', '''
def to_bin(n):
    if n == 0:
        return "0"
    out = ""
    while n > 0:
        out = str(n % 2) + out
        n //= 2
    return out
print([to_bin(n) for n in [0, 1, 5, 10, 255]])
''')
add('alg-13', 'matrix spiral', '''
def spiral(m):
    out = []
    top, bottom, left, right = 0, len(m) - 1, 0, len(m[0]) - 1
    while top <= bottom and left <= right:
        for c in range(left, right + 1):
            out.append(m[top][c])
        top += 1
        for r in range(top, bottom + 1):
            out.append(m[r][right])
        right -= 1
        if top <= bottom:
            for c in range(right, left - 1, -1):
                out.append(m[bottom][c])
            bottom -= 1
        if left <= right:
            for r in range(bottom, top - 1, -1):
                out.append(m[r][left])
            left += 1
    return out
print(spiral([[1, 2, 3], [4, 5, 6], [7, 8, 9]]))
''')
add('alg-14', 'max subarray', '''
def kadane(xs):
    best = cur = xs[0]
    for x in xs[1:]:
        cur = max(x, cur + x)
        best = max(best, cur)
    return best
print(kadane([-2, 1, -3, 4, -1, 2, 1, -5, 4]), kadane([-3, -1]))
''')
add('alg-15', 'rotate list', '''
def rotate(xs, k):
    k = k % len(xs)
    return xs[-k:] + xs[:-k]
print(rotate([1, 2, 3, 4, 5], 2), rotate([1, 2, 3], 4))
''')
add('alg-16', 'average float formatting', '''
scores = [72, 85, 90, 66]
avg = sum(scores) / len(scores)
print(avg)
print(f"average {avg:.2f}")
print(round(avg, 1))
''')
add('alg-17', 'histogram text', '''
data = [3, 1, 4]
labels = ["a", "b", "c"]
for lab, n in zip(labels, data):
    print(f"{lab:<2}" + "#" * n)
''')
add('alg-18', 'gcd of list input', '''
nums = [int(x) for x in input().split()]
g = nums[0]
for n in nums[1:]:
    while n:
        g, n = n, g % n
print(g)
''', ['48 180 36'])
add('alg-19', 'pascal triangle', '''
row = [1]
for i in range(6):
    print(row)
    row = [1] + [row[j] + row[j + 1] for j in range(len(row) - 1)] + [1]
''')
add('alg-20', 'roman numerals', '''
def roman(n):
    vals = [(1000, "M"), (900, "CM"), (500, "D"), (400, "CD"), (100, "C"), (90, "XC"),
            (50, "L"), (40, "XL"), (10, "X"), (9, "IX"), (5, "V"), (4, "IV"), (1, "I")]
    out = ""
    for v, s in vals:
        while n >= v:
            out += s
            n -= v
    return out
print(roman(1994), roman(2026), roman(4))
''')
add('alg-21', 'dict default list of tuples', '''
pairs = [("x", 1), ("y", 2), ("x", 3)]
acc = {}
for k, v in pairs:
    acc[k] = acc.get(k, []) + [v]
print(acc)
''')
add('alg-22', 'string builder join', '''
parts = []
for i in range(5):
    parts.append(str(i * i))
print(",".join(parts))
print("".join(reversed(parts)))
''')
add('alg-23', 'nested function calls', '''
def square(x):
    return x * x
def sum_squares(n):
    return sum([square(i) for i in range(1, n + 1)])
print(sum_squares(10), square(square(3)))
''')
add('alg-24', 'count in range', '''
count = 0
for n in range(1, 101):
    if n % 7 == 0 or "7" in str(n):
        count += 1
print(count)
''')
add('alg-25', 'list of dicts', '''
students = [{"name": "Ann", "score": 81}, {"name": "Ben", "score": 67}, {"name": "Cy", "score": 92}]
passed = [s["name"] for s in students if s["score"] >= 70]
top = max(students, key=lambda s: s["score"])
print(passed, top["name"])
''')
