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
