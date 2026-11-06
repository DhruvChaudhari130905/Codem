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
