"""Generate problems/<slug>/{problem.md,meta.json,samples.json,hidden.json}.

Each problem has a reference solution; expected outputs are computed from it.
Run: python3 problems/_gen/gen.py   (deterministic: fixed seed per problem)
"""
import gzip
import heapq
import json
import random
import re
from bisect import bisect_left
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PROBLEMS = []


def problem(slug, title, difficulty, statement, samples, cpu_sec=2, mem_mb=256):
    def wrap(fn):
        PROBLEMS.append(dict(slug=slug, title=title, difficulty=difficulty, statement=statement.strip() + "\n",
                             samples=samples, cpu_sec=cpu_sec, mem_mb=mem_mb, solve=fn, gen=None))
        return fn
    return wrap


def hidden(slug):
    def wrap(fn):
        next(p for p in PROBLEMS if p["slug"] == slug)["gen"] = fn
        return fn
    return wrap


def ints(s):
    return list(map(int, s.split()))


def arr_input(a):
    return f"{len(a)}\n{' '.join(map(str, a))}\n"


# ---------------- easy ----------------

@problem("reverse-words", "Reverse the words", "easy", """
# Reverse the words

Read one line of words separated by single spaces. Print the words in reverse order, separated by single spaces.

## Input
One line with 1 to 100 000 words. Each word is 1–10 lowercase letters.

## Output
The words in reverse order.

## Example
Input:
```
the quick brown fox
```
Output:
```
fox brown quick the
```
""", ["the quick brown fox\n", "codem\n"])
def _(s):
    return " ".join(reversed(s.split())) + "\n"


@hidden("reverse-words")
def _(r):
    out = ["a b\n", "x\n", "hello world hello\n"]
    for n in (5, 20, 100, 1000, 5000, 10000):
        out.append(" ".join("".join(r.choice("abcdefghij") for _ in range(r.randint(1, 10))) for _ in range(n)) + "\n")
    out.append(" ".join("w" + str(i % 10) for i in range(100000)) + "\n")
    return out


@problem("count-vowels", "Count the vowels", "easy", """
# Count the vowels

Read one line of text. Print how many characters are vowels (`a e i o u`, upper or lower case).

## Input
One line of up to 500 000 printable ASCII characters.

## Output
A single integer.

## Example
Input:
```
Hello, World!
```
Output:
```
3
```
""", ["Hello, World!\n", "rhythm\n"])
def _(s):
    line = s.split("\n")[0]
    return f"{sum(c in 'aeiouAEIOU' for c in line)}\n"


@hidden("count-vowels")
def _(r):
    chars = "abcdefghijklmnopqrstuvwxyzAEIOU ,.!?"
    out = ["a\n", "AEIOUaeiou\n", "xyz\n", "Programming is fun\n"]
    for n in (10, 100, 1000, 10000, 100000):
        out.append("".join(r.choice(chars) for _ in range(n)) + "\n")
    out.append("".join(r.choice(chars) for _ in range(500000)) + "\n")
    return out


@problem("sum-of-evens", "Sum of even numbers", "easy", """
# Sum of even numbers

Given `n` integers, print the sum of the even ones.

## Input
The first line has `n` (1 ≤ n ≤ 80 000). The second line has `n` integers, each between −10⁹ and 10⁹.

## Output
The sum of the even integers (0 if there are none).

## Example
Input:
```
5
1 2 3 4 5
```
Output:
```
6
```
""", ["5\n1 2 3 4 5\n", "3\n-2 7 -8\n"])
def _(s):
    a = ints(s)[1:]
    return f"{sum(x for x in a if x % 2 == 0)}\n"


@hidden("sum-of-evens")
def _(r):
    out = [arr_input([1]), arr_input([2]), arr_input([1, 3, 5]), arr_input([-4, -6, 10])]
    for n in (10, 100, 1000, 10000, 50000):
        out.append(arr_input([r.randint(-10**9, 10**9) for _ in range(n)]))
    out.append(arr_input([r.randint(-10**9, 10**9) for _ in range(80000)]))
    return out


@problem("is-palindrome", "Palindrome check", "easy", """
# Palindrome check

Read one line. Ignoring case and every character that is not a letter or digit, is it a palindrome? Print `YES` or `NO`.

## Input
One line of up to 500 000 printable ASCII characters.

## Output
`YES` or `NO`.

## Example
Input:
```
A man, a plan, a canal: Panama
```
Output:
```
YES
```
""", ["A man, a plan, a canal: Panama\n", "codem\n"])
def _(s):
    t = re.sub(r"[^a-z0-9]", "", s.split("\n")[0].lower())
    return "YES\n" if t == t[::-1] else "NO\n"


@hidden("is-palindrome")
def _(r):
    out = ["a\n", "ab\n", "!!\n", "No 'x' in Nixon\n", "Was it a car or a cat I saw?\n", "race a car\n"]
    for n in (1000, 50000):
        half = "".join(r.choice("abcXYZ019") for _ in range(n))
        out.append(half + " , " + half[::-1] + "\n")
        out.append(half + "q" + half + "\n")
    half = "".join(r.choice("abcdefXYZ0123, ") for _ in range(250000))
    out.append(half + half[::-1] + "\n")
    return out


@problem("second-largest", "Second largest", "easy", """
# Second largest

Given `n` integers, print the second largest **distinct** value. If every value is the same, print `NONE`.

## Input
The first line has `n` (1 ≤ n ≤ 80 000). The second line has `n` integers, each between −10⁹ and 10⁹.

## Output
The second largest distinct value, or `NONE`.

## Example
Input:
```
5
4 9 9 2 7
```
Output:
```
7
```
""", ["5\n4 9 9 2 7\n", "3\n5 5 5\n"])
def _(s):
    a = sorted(set(ints(s)[1:]))
    return f"{a[-2]}\n" if len(a) >= 2 else "NONE\n"


@hidden("second-largest")
def _(r):
    out = [arr_input([1]), arr_input([1, 2]), arr_input([2, 1]), arr_input([-5, -5, -7]), arr_input([7, 7])]
    for n in (10, 1000, 10000, 50000):
        out.append(arr_input([r.randint(-10**9, 10**9) for _ in range(n)]))
    out.append(arr_input([10**9] * 79999 + [-10**9]))
    return out


@problem("fizzbuzz", "FizzBuzz", "easy", """
# FizzBuzz

For every integer `i` from 1 to `n`, print one line: `FizzBuzz` if `i` is divisible by 15, `Fizz` if divisible by 3, `Buzz` if divisible by 5, otherwise `i`.

## Input
One integer `n` (1 ≤ n ≤ 100 000).

## Output
`n` lines.

## Example
Input:
```
5
```
Output:
```
1
2
Fizz
4
Buzz
```
""", ["5\n", "15\n"])
def _(s):
    n = int(s)
    return "".join(("FizzBuzz" if i % 15 == 0 else "Fizz" if i % 3 == 0 else "Buzz" if i % 5 == 0 else str(i)) + "\n" for i in range(1, n + 1))


@hidden("fizzbuzz")
def _(r):
    return [f"{n}\n" for n in (1, 2, 3, 10, 30, 99, 101, 1000, 12345, 100000)]


# ---------------- medium ----------------

@problem("max-subarray", "Best streak", "medium", """
# Best streak

Given `n` integers, find the largest possible sum of a non-empty contiguous subarray.

## Input
The first line has `n` (1 ≤ n ≤ 80 000). The second line has `n` integers, each between −10⁹ and 10⁹.

## Output
The maximum subarray sum.

## Example
Input:
```
9
-2 1 -3 4 -1 2 1 -5 4
```
Output:
```
6
```
""", ["9\n-2 1 -3 4 -1 2 1 -5 4\n", "3\n-3 -1 -2\n"])
def _(s):
    a = ints(s)[1:]
    best = cur = a[0]
    for x in a[1:]:
        cur = max(x, cur + x)
        best = max(best, cur)
    return f"{best}\n"


@hidden("max-subarray")
def _(r):
    out = [arr_input([5]), arr_input([-5]), arr_input([1, 2, 3]), arr_input([-1, -2, -3])]
    for n in (10, 100, 1000, 10000, 50000):
        out.append(arr_input([r.randint(-10**9, 10**9) for _ in range(n)]))
    out.append(arr_input([10**9] * 80000))
    return out


@problem("balanced-brackets", "Balanced brackets", "medium", """
# Balanced brackets

A string of the characters `()[]{}` is balanced if every opening bracket is closed by the matching bracket in the correct order. Print `YES` if the string is balanced, otherwise `NO`.

## Input
One line of 1 to 500 000 bracket characters.

## Output
`YES` or `NO`.

## Example
Input:
```
{[()()]}
```
Output:
```
YES
```
""", ["{[()()]}\n", "([)]\n"])
def _(s):
    pairs = {")": "(", "]": "[", "}": "{"}
    st = []
    for c in s.strip():
        if c in "([{":
            st.append(c)
        elif not st or st.pop() != pairs[c]:
            return "NO\n"
    return "YES\n" if not st else "NO\n"


@hidden("balanced-brackets")
def _(r):
    def balanced(n):
        out, st = [], []
        while len(out) + len(st) < n:
            if st and r.random() < 0.5:
                out.append({"(": ")", "[": "]", "{": "}"}[st.pop()])
            else:
                c = r.choice("([{")
                st.append(c)
                out.append(c)
        while st:
            out.append({"(": ")", "[": "]", "{": "}"}[st.pop()])
        return "".join(out)
    out = ["(\n", ")\n", "()\n", "(]\n", "((((\n", "{}[]()\n"]
    b = balanced(1000)
    out += [b + "\n", b[:-1] + "\n"]
    big = balanced(250000)
    out += ["(" * 250000 + ")" * 250000 + "\n", big + "\n", big + "(" + "\n"]
    return out


@problem("longest-unique-substring", "Longest unique run", "medium", """
# Longest unique run

Find the length of the longest substring with no repeated characters.

## Input
One line of 1 to 500 000 lowercase letters.

## Output
A single integer.

## Example
Input:
```
abcabcbb
```
Output:
```
3
```
""", ["abcabcbb\n", "bbbbb\n"])
def _(s):
    t = s.strip()
    last, start, best = {}, 0, 0
    for i, c in enumerate(t):
        if last.get(c, -1) >= start:
            start = last[c] + 1
        last[c] = i
        best = max(best, i - start + 1)
    return f"{best}\n"


@hidden("longest-unique-substring")
def _(r):
    out = ["a\n", "ab\n", "aa\n", "pwwkew\n", "abcdefghijklmnopqrstuvwxyz\n", "abba\n"]
    for n, alpha in ((100, "abcde"), (10000, "abcdefghijklmnop"), (100000, "abcdefghijklmnopqrstuvwxyz")):
        out.append("".join(r.choice(alpha) for _ in range(n)) + "\n")
    out.append("abcdefghijklmnopqrstuvwxyz" * 19230 + "\n")
    return out


@problem("pair-count", "Pairs that add up", "medium", """
# Pairs that add up

Given `n` integers and a target `k`, count the index pairs `i < j` with `a[i] + a[j] = k`.

## Input
The first line has `n` and `k` (1 ≤ n ≤ 200 000, |k| ≤ 2·10⁹). The second line has `n` integers, each between −10⁹ and 10⁹.

## Output
The number of pairs (it may exceed 2³¹).

## Example
Input:
```
5 6
1 5 3 3 7
```
Output:
```
2
```
""", ["5 6\n1 5 3 3 7\n", "4 0\n0 0 0 0\n"])
def _(s):
    v = ints(s)
    n, k, a = v[0], v[1], v[2:]
    seen, total = {}, 0
    for x in a:
        total += seen.get(k - x, 0)
        seen[x] = seen.get(x, 0) + 1
    return f"{total}\n"


@hidden("pair-count")
def _(r):
    def case(n, k, lo, hi):
        return f"{n} {k}\n{' '.join(str(r.randint(lo, hi)) for _ in range(n))}\n"
    out = ["1 2\n1\n", "2 2\n1 1\n", "3 -1\n-1 0 5\n", "4 10\n1 2 3 4\n"]
    out += [case(100, 10, 0, 10), case(1000, 0, -50, 50), case(10000, 7, 0, 10), case(50000, 1000, 0, 1000)]
    out.append(f"200000 0\n{' '.join(['0'] * 200000)}\n")
    out.append(case(80000, 0, -10**9, 10**9))
    return out


@problem("merge-intervals", "Merge the bookings", "medium", """
# Merge the bookings

Given `n` closed intervals `[l, r]`, merge every group of overlapping or touching intervals (`[1,3]` and `[3,5]` merge; `[1,2]` and `[3,4]` do not). Print the merged intervals sorted by start.

## Input
The first line has `n` (1 ≤ n ≤ 50 000). Each of the next `n` lines has `l r` (0 ≤ l ≤ r ≤ 10⁹).

## Output
First the number of merged intervals `m`, then `m` lines `l r`.

## Example
Input:
```
4
1 3
8 10
2 6
15 18
```
Output:
```
3
1 6
8 10
15 18
```
""", ["4\n1 3\n8 10\n2 6\n15 18\n", "2\n1 2\n3 4\n"])
def _(s):
    v = ints(s)
    iv = sorted(zip(v[1::2], v[2::2]))
    merged = []
    for l, rr in iv:
        if merged and l <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], rr)
        else:
            merged.append([l, rr])
    return f"{len(merged)}\n" + "".join(f"{l} {rr}\n" for l, rr in merged)


@hidden("merge-intervals")
def _(r):
    def case(n, span, width):
        rows = []
        for _ in range(n):
            l = r.randint(0, span)
            rows.append(f"{l} {l + r.randint(0, width)}")
        return f"{n}\n" + "\n".join(rows) + "\n"
    out = ["1\n0 0\n", "2\n1 3\n3 5\n", "2\n5 6\n1 2\n", "3\n1 10\n2 3\n4 5\n"]
    out += [case(10, 50, 5), case(100, 1000, 20), case(1000, 10**6, 500), case(10000, 10**9, 10**5), case(50000, 10**7, 100)]
    out.append(case(45000, 10**9 - 10**6, 10**4))
    return out


@problem("grid-paths", "Paths through the maze", "medium", """
# Paths through the maze

A grid has `h` rows and `w` columns. `.` is open and `#` is a wall. Starting at the top-left cell you may move only right or down. Count the paths to the bottom-right cell, modulo 1 000 000 007. If the start or end is a wall, the answer is 0.

## Input
The first line has `h w` (1 ≤ h, w ≤ 1000). The next `h` lines each have `w` characters.

## Output
The number of paths modulo 1 000 000 007.

## Example
Input:
```
3 3
...
.#.
...
```
Output:
```
2
```
""", ["3 3\n...\n.#.\n...\n", "2 2\n.#\n#.\n"])
def _(s):
    lines = s.split("\n")
    h, w = map(int, lines[0].split())
    g = lines[1:1 + h]
    MOD = 10**9 + 7
    dp = [0] * w
    for i in range(h):
        for j in range(w):
            if g[i][j] == "#":
                dp[j] = 0
            elif i == 0 and j == 0:
                dp[j] = 1
            elif j > 0:
                dp[j] = (dp[j] + dp[j - 1]) % MOD
    return f"{dp[w - 1] % MOD}\n"


@hidden("grid-paths")
def _(r):
    def case(h, w, p):
        rows = ["".join("#" if r.random() < p else "." for _ in range(w)) for _ in range(h)]
        rows[0] = "." + rows[0][1:]
        rows[-1] = rows[-1][:-1] + "."
        return f"{h} {w}\n" + "\n".join(rows) + "\n"
    out = ["1 1\n.\n", "1 1\n#\n", "1 5\n.....\n", "5 1\n.\n.\n#\n.\n.\n", "2 3\n...\n...\n"]
    out += [case(10, 10, 0.1), case(50, 80, 0.2), case(300, 300, 0.05), case(1000, 1000, 0.0)]
    out.append(case(1000, 1000, 0.1))
    return out


# ---------------- hard ----------------

@problem("shortest-route", "Shortest route", "hard", """
# Shortest route

A city has `n` junctions and `m` one-way roads. Road `i` goes from `u` to `v` and takes `w` minutes. Print the fastest time from junction 1 to junction `n`, or `-1` if `n` cannot be reached.

## Input
The first line has `n m` (2 ≤ n ≤ 20 000, 0 ≤ m ≤ 50 000). Each of the next `m` lines has `u v w` (1 ≤ u, v ≤ n, 1 ≤ w ≤ 10⁹).

## Output
The minimum total time, or `-1`.

## Example
Input:
```
4 4
1 2 5
2 4 5
1 3 2
3 4 9
```
Output:
```
10
```
""", ["4 4\n1 2 5\n2 4 5\n1 3 2\n3 4 9\n", "3 1\n2 3 1\n"], cpu_sec=3, mem_mb=512)
def _(s):
    v = ints(s)
    n, m = v[0], v[1]
    adj = [[] for _ in range(n + 1)]
    for i in range(m):
        a, b, w = v[2 + 3 * i:5 + 3 * i]
        adj[a].append((b, w))
    dist = [None] * (n + 1)
    pq = [(0, 1)]
    while pq:
        d, u = heapq.heappop(pq)
        if dist[u] is not None:
            continue
        dist[u] = d
        for b, w in adj[u]:
            if dist[b] is None:
                heapq.heappush(pq, (d + w, b))
    return f"{dist[n] if dist[n] is not None else -1}\n"


@hidden("shortest-route")
def _(r):
    def case(n, m, wmax):
        edges = [f"{i} {i + 1} {r.randint(1, wmax) * 50}" for i in range(1, n)]  # slow backbone
        edges += [f"{r.randint(1, n)} {r.randint(1, n)} {r.randint(1, wmax)}" for _ in range(m - len(edges))]
        r.shuffle(edges)
        return f"{n} {len(edges)}\n" + "\n".join(edges) + "\n"
    out = ["2 0\n", "2 1\n1 2 7\n", "2 1\n2 1 7\n", "3 3\n1 2 1\n2 3 1\n1 3 3\n", "3 2\n1 2 1000000000\n2 3 1000000000\n"]
    out += [case(10, 20, 10), case(1000, 3000, 100), case(10000, 30000, 10**6), case(10000, 30000, 10**9)]
    out.append(case(20000, 45000, 10**9))
    return out


@problem("longest-increasing", "Longest climb", "hard", """
# Longest climb

Given `n` integers, find the length of the longest strictly increasing subsequence (not necessarily contiguous).

## Input
The first line has `n` (1 ≤ n ≤ 120 000). The second line has `n` integers, each between −10⁹ and 10⁹.

## Output
A single integer.

## Example
Input:
```
8
10 9 2 5 3 7 101 18
```
Output:
```
4
```
""", ["8\n10 9 2 5 3 7 101 18\n", "4\n3 3 3 3\n"])
def _(s):
    a = ints(s)[1:]
    tails = []
    for x in a:
        i = bisect_left(tails, x)
        if i == len(tails):
            tails.append(x)
        else:
            tails[i] = x
    return f"{len(tails)}\n"


@hidden("longest-increasing")
def _(r):
    out = [arr_input([1]), arr_input([2, 1]), arr_input([1, 2]), arr_input([5, 5, 5]), arr_input(list(range(10, 0, -1)))]
    for n in (100, 1000, 10000, 50000):
        out.append(arr_input([r.randint(-10**9, 10**9) for _ in range(n)]))
    out.append(arr_input(list(range(120000))))
    out.append(arr_input([r.randint(-10**9, 10**9) for _ in range(80000)]))
    return out


@problem("count-inversions", "Out of order", "hard", """
# Out of order

Count the pairs `i < j` with `a[i] > a[j]`.

## Input
The first line has `n` (1 ≤ n ≤ 120 000). The second line has `n` integers, each between −10⁹ and 10⁹.

## Output
The number of inversions (it may exceed 2³¹).

## Example
Input:
```
5
2 4 1 3 5
```
Output:
```
3
```
""", ["5\n2 4 1 3 5\n", "3\n1 1 1\n"])
def _(s):
    a = ints(s)[1:]
    # Fenwick tree over compressed values.
    ranks = {v: i + 1 for i, v in enumerate(sorted(set(a)))}
    tree = [0] * (len(ranks) + 1)
    inv = 0
    for seen, x in enumerate(a):
        k = ranks[x]
        le = 0
        i = k
        while i > 0:
            le += tree[i]
            i -= i & -i
        inv += seen - le
        i = k
        while i < len(tree):
            tree[i] += 1
            i += i & -i
    return f"{inv}\n"


@hidden("count-inversions")
def _(r):
    out = [arr_input([1]), arr_input([2, 1]), arr_input([1, 2]), arr_input([3, 3, 1]), arr_input(list(range(10, 0, -1)))]
    for n in (100, 1000, 10000, 50000):
        out.append(arr_input([r.randint(-10**9, 10**9) for _ in range(n)]))
    out.append(arr_input(list(range(120000, 0, -1))))
    out.append(arr_input([r.randint(-10**9, 10**9) for _ in range(80000)]))
    return out


def stated_max_n(statement):
    """The `n ≤ X` bound in a statement whose input starts with n, else None."""
    m = re.search(r"The first line has `n[ `].*?n ≤ ([\d ]+)", statement)
    return int(m.group(1).replace(" ", "")) if m else None


def main():
    for i, p in enumerate(PROBLEMS):
        assert p["gen"], p["slug"]
        r = random.Random(1000 + i)
        d = ROOT / p["slug"]
        d.mkdir(exist_ok=True)
        (d / "problem.md").write_text(p["statement"])
        meta = {"title": p["title"], "difficulty": p["difficulty"], "cpuSec": p["cpu_sec"], "memMb": p["mem_mb"]}
        (d / "meta.json").write_text(json.dumps(meta, indent=2) + "\n")
        samples = [{"stdin": s, "expected": p["solve"](s)} for s in p["samples"]]
        (d / "samples.json").write_text(json.dumps(samples, indent=2) + "\n")
        hid = [{"stdin": s, "expected": p["solve"](s)} for s in p["gen"](r)]
        assert len(hid) >= 10, p["slug"]
        bound = stated_max_n(p["statement"])
        if bound is not None:
            largest = max(int(t["stdin"].split()[0]) for t in hid)
            assert largest <= bound, f'{p["slug"]}: test n={largest} exceeds stated bound {bound}'
            assert largest * 2 > bound, f'{p["slug"]}: stated bound {bound} far above largest test n={largest}'

        assert all(len(t["stdin"]) <= 1_048_576 and len(t["expected"]) <= 1_048_576 for t in hid), p["slug"]
        # Hidden tests are stored gzipped (mtime=0 keeps the bytes deterministic).
        (d / "hidden.json.gz").write_bytes(gzip.compress((json.dumps(hid) + "\n").encode(), compresslevel=9, mtime=0))
        (d / "hidden.json").unlink(missing_ok=True)
        print(f"{p['difficulty']:6} {p['slug']:26} samples={len(samples)} hidden={len(hid)} {sum(len(t['stdin']) for t in hid) // 1024} KB")


if __name__ == "__main__":
    main()
