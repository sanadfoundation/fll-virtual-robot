# Reference solution for Colour Crawl.
# Drive east. Each colored stripe completes its step as the sensor reads it.

from spike import PrimeHub, MotorPair, ColorSensor, port
import runloop

hub   = PrimeHub()
drive = MotorPair(port.A, port.B)
color = ColorSensor(port.C)

async def main():
    # Drive east past all four stripes (x=800 to x=2000).
    await drive.move(1800)

runloop.run(main())
