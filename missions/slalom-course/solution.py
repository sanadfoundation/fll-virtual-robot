# Reference solution for Slalom Course — weave between the walls.
from spike import PrimeHub, MotorPair, port
import runloop

hub   = PrimeHub()
drive = MotorPair(port.A, port.B)

async def main():
    # Curve down past wall 1, up past wall 2, down past 3, up past 4, into finish.
    await drive.move(400)                        # forward to first gap
    await drive.move_for_degrees(120, 60, -60)   # curve down-right
    await drive.move(350)
    await drive.move_for_degrees(120, -60, 60)   # curve up-right
    await drive.move(350)
    await drive.move_for_degrees(120, 60, -60)
    await drive.move(350)
    await drive.move_for_degrees(120, -60, 60)
    await drive.move(500)                        # into finish

runloop.run(main())
