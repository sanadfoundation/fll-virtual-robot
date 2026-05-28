# Reference solution for Energy Pickup.
# Drive northeast to the depot, push the energy block south then east into storage.

from spike import PrimeHub, MotorPair, port
import runloop

hub   = PrimeHub()
drive = MotorPair(port.A, port.B)

async def main():
    # Reach the depot
    await drive.move(900)
    await drive.move_for_degrees(180, 60, -60)    # half pivot
    await drive.move(200)
    # Push the energy block out of the depot, south
    await drive.move_for_degrees(180, 60, -60)
    await drive.move(400)
    # Then east into storage
    await drive.move_for_degrees(180, 60, -60)
    await drive.move(800)

runloop.run(main())
