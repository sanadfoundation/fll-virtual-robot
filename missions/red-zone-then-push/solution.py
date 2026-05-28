# Reference solution for the "Red Zone then Push" mission.
# Drives east to the red zone, then loops back and pushes obstacle 1 off green.

from spike import PrimeHub, MotorPair, port
import runloop

hub   = PrimeHub()
drive = MotorPair(port.A, port.B)

async def main():
    # Step 1: reach the red zone.
    await drive.move(1350)       # east, through yellow, into red.

    # Step 2: turn north, push obstacle 1 off the green zone.
    await drive.move_for_degrees(180, 50, -50)   # half-pivot
    await drive.move(700)                         # forward into obstacle 1

runloop.run(main())
