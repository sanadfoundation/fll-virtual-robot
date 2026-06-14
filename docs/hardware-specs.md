# Hardware specs (LEGO SPIKE Prime)

Source-of-truth numbers for what the simulator models. When a Monaco/Python docstring claims a hardware fact, it should match this list (sources cited inline in `py/spike_bridge.py` and `js/monaco_config.js`).

## Technic Angular Motor

- Encoder: 360 counts/rev (1°), accuracy ±3°, 100 Hz update
- No-load: 185 RPM Medium / 175 RPM Large (≈1110 / 1050 deg/sec)
- Rated (max-efficiency): 135 RPM ≈ 810 deg/sec @ 3.5 Ncm (M) / 8 Ncm (L)
- Stall torque: 18 Ncm (M) / 25 Ncm (L)
- Reference supply: 7.2 V

## Technic Large Hub

- 6 LPF2 ports A–F (E/F "high-speed")
- 5×5 white LED matrix, 10-step per-LED dimming
- Six-axis IMU (3-axis accel + 3-axis gyro), gestures (tap, double-tap, shake, free-fall)
- Speaker: 12-bit / 16 kHz mono
- BT 4.2 Classic + BLE
- CPU: 100 MHz Cortex-M4, 320 KB RAM, 1 MB flash, 32 MB storage
- Dimensions: 88 × 56 × 32 mm, 63 g

## Technic Color Sensor

- 100 Hz; optimal reading distance 16 mm
- Reflectivity 0–100; ambient light 0–100
- Reliably distinguishes 8 LEGO-named colors (white, blue, black, green, yellow, red, medium azur, bright reddish violet); API surfaces 12 `color.*` constants via classification
- 3× 4000 K white LEDs, 0–100% in 1% increments, exclusive with sensing

## Technic Distance Sensor

- Ultrasonic; 100 Hz
- Range 50–2000 mm ±20 mm, 1 mm resolution; fast-distance 50–300 mm ±15 mm; entrance angle ±35°
- **50 mm blind zone** — below that the sensor returns no object
- 4× 4000 K white LED segments, 0–100% in 1% increments

## Technic Force Sensor

- 100 Hz (internal force-filter / peak at 1 kHz)
- Touch: 0.5–1.0 N activation, depth 0–2 mm, binary output
- Tap: 0–3 (single / quick / press-and-hold)
- Force: 2.5–10 N range (saturates at 10), 0.1 N steps, ±0.65 N accuracy, depth 2–8 mm
