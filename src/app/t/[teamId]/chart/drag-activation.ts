/// Sensor activation shared by both drag surfaces — the batting order (#10)
/// and the positions diamond (#11).
///
/// The touch delay is a stated product requirement (Decision 10), not a
/// nicety: it is what lets a coach scroll a chart page on a phone without every
/// touch starting a drag. Movement within the tolerance keeps the delay timer
/// alive; movement beyond it is a scroll. Both editors must feel the same, so
/// the numbers live in one place rather than being typed twice.
export const TOUCH_ACTIVATION = { delay: 250, tolerance: 8 } as const;

/// Desktop: a small distance threshold separates clicks from drags.
export const MOUSE_ACTIVATION = { distance: 5 } as const;
