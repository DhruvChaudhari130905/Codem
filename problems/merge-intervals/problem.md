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
