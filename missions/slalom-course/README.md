# Slalom Course

An **obstacle course** (single-objective). Drive from the start at the left
edge to the green finish zone on the right, weaving between four vertical
walls. Touching a wall costs points; finishing under 25 seconds is the
target.

## Scoring

- Base: **100** if you reach the finish zone, **0** if you don't.
- Collisions: **-10** per distinct wall touched, capped at **-80**.
- Time penalty: **-2** per second over 25s.

A clean fast run = 100. A slow scrape = whatever's left.

## Field

Robot starts on the left at (350, 571) facing east. Four walls alternate
between bottom-anchored and top-anchored. Finish zone is the green
rectangle on the right.
