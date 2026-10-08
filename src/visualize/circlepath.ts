// SPDX-FileCopyrightText: 2021 Kirk McDonald
// SPDX-FileCopyrightText: 2026 Christian Charon
// SPDX-License-Identifier: Apache-2.0

// Link paths built from circular arcs. Arcs can be offset in parallel exactly, which the
// visualizer uses to draw the individual belts of a link.

/** A point. */
export interface Point {
    readonly x: number
    readonly y: number
}

/** 1 for clockwise, 0 for counter-clockwise, as in the SVG arc command. */
type Sweep = 0 | 1

/** A point of a path with the unit tangent there and the arc that leads to it. */
interface PathPoint extends Point {
    readonly nx: number
    readonly ny: number
    /** Radius of the arc leading to this point, or null for a straight line or the first point. */
    readonly r: number | null
    readonly sweep: Sweep | null
}

function norm([x, y]: readonly [number, number]): [number, number] {
    const d = Math.sqrt(x ** 2 + y ** 2)
    return [x / d, y / d]
}

/** A path of circular arcs through given points, starting in a given direction. */
export class CirclePath {
    readonly points: readonly PathPoint[]

    /**
     * Builds the arcs from the start direction (nx, ny) through pairs. Each arc ends tangent to
     * the next one. points may be passed directly instead, which transpose() uses.
     */
    constructor(nx: number, ny: number, pairs: readonly Point[], points?: readonly PathPoint[]) {
        if (points) {
            this.points = points
            return
        }
        const first = pairs[0]
        if (first === undefined) {
            throw new Error("a path needs at least one point")
        }
        const result: PathPoint[] = [{ x: first.x, y: first.y, nx, ny, r: null, sweep: null }]
        let prevX = first.x
        let prevY = first.y
        for (const { x, y } of pairs.slice(1)) {
            const dx = (x - prevX) / 2
            const dy = (y - prevY) / 2
            const t = nx * dx + ny * dy
            let r1 = -ny * dx + nx * dy

            // A deflection below one pixel is drawn as a straight line. The tangent still turns.
            if (-0.5 < r1 && r1 < 0.5) {
                const [normdx, normdy] = norm([dx, dy])
                const dot = nx * normdx + ny * normdy
                nx = 2 * dot * normdx - nx
                ny = 2 * dot * normdy - ny
                result.push({ x, y, nx, ny, r: null, sweep: null })
                prevX = x
                prevY = y
                continue
            }

            let sweep: Sweep = 1
            let npx = -ny
            let npy = nx
            if (r1 < 0) {
                sweep = 0
                r1 = -r1
                npx = -npx
                npy = -npy
            }
            const r = r1 + t ** 2 / r1
            const cx = npx * r
            const cy = npy * r

            // Tangent at the end of the arc.
            npx = (cx - 2 * dx) / r
            npy = (cy - 2 * dy) / r
            nx = npy
            ny = -npx
            if (sweep === 0) {
                nx = -nx
                ny = -ny
            }
            result.push({ x, y, nx, ny, r, sweep })
            prevX = x
            prevY = y
        }
        this.points = result
    }

    /** Returns the SVG path data. */
    path(): string {
        const [first, ...rest] = this.points
        if (first === undefined) {
            return ""
        }
        const parts = [`M ${first.x},${first.y}`]
        for (const { x, y, r, sweep } of rest) {
            if (r === null || sweep === null || Number.isNaN(r)) {
                parts.push(`L ${x},${y}`)
            } else {
                parts.push(`A ${r} ${r} 0 0 ${sweep} ${x} ${y}`)
            }
        }
        return parts.join(" ")
    }

    /** Returns the parallel path at the given distance to the left of this one. */
    offset(offset: number): CirclePath {
        const first = this.points[0]
        const points = this.points.map(({ x, y, nx, ny }) => ({ x: x + -ny * offset, y: y + nx * offset }))
        return new CirclePath(first?.nx ?? 1, first?.ny ?? 0, points)
    }

    /** Returns the path mirrored at the diagonal, which swaps x and y. */
    transpose(): CirclePath {
        const points = this.points.map(({ x, y, nx, ny, r, sweep }): PathPoint => ({
            x: y,
            y: x,
            nx: ny,
            ny: nx,
            r,
            sweep: sweep === null ? null : sweep === 0 ? 1 : 0,
        }))
        return new CirclePath(0, 0, [], points)
    }
}

const MIN_RADIUS = 10
const MAX_DOUBLE_ARC_SLOPE = 0.75

// Paths come in three kinds. Slopes are measured in the frame of the initial tangent vector.
// 1) Straight line, for slope 0.
// 2) Double arcs, for slopes up to MAX_DOUBLE_ARC_SLOPE in either direction: one arc from the start to the middle and one
//    from the middle to the end.
// 3) Double arcs with an adjustment arc at each end, for steeper slopes. The adjustment lets the
//    slope at the middle be twice the overall slope, similar to a cubic Bezier curve.

type Vector = [number, number]

// Vector from start point to end point in the reference frame of the tangent vector.
function toFrame(tx: number, ty: number, x: number, y: number): Vector {
    return [tx * x + ty * y, -ty * x + tx * y]
}

function fromFrame(tx: number, ty: number, x: number, y: number): Vector {
    return toFrame(tx, -ty, x, y)
}

function linePath(tx: number, ty: number, x1: number, y1: number, x2: number, y2: number): CirclePath {
    return new CirclePath(tx, ty, [{ x: x1, y: y1 }, { x: x2, y: y2 }])
}

function doubleArcPath(tx: number, ty: number, x1: number, y1: number, x2: number, y2: number): CirclePath {
    const mid = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 }
    return new CirclePath(tx, ty, [{ x: x1, y: y1 }, mid, { x: x2, y: y2 }])
}

// Rotations by 90 degrees in SVG coordinates, where the y axis points down.
function R(x: number, y: number): Vector {
    return [-y, x]
}

function L(x: number, y: number): Vector {
    return [y, -x]
}

function doubleArcAdjustPath(tx: number, ty: number, x1: number, y1: number, x2: number, y2: number, width: number): CirclePath {
    const [fx, fy] = toFrame(tx, ty, x2 - x1, y2 - y1)
    // Curving to the right or to the left.
    const T = fy > 0 ? R : L
    const [nx, ny] = T(tx, ty)

    // First circle: radius and center.
    const r = width / 2 + MIN_RADIUS
    const cx = x1 + nx * r
    const cy = y1 + ny * r

    // Center point of the whole curve, the tangent wanted there, and the unit normal pointing
    // to the center of the second circle.
    const p3x = (x1 + x2) / 2
    const p3y = (y1 + y2) / 2
    const [ctx, cty] = fromFrame(tx, ty, fx / 2, fy)
    const [cnx, cny] = norm(T(ctx, cty))

    // Go r units from p3 towards the second center, then take the vector from the first center
    // to that point. m points from its midpoint to the second center.
    const midx = p3x + cnx * r
    const midy = p3y + cny * r
    const [mx, my] = norm(T(midx - cx, midy - cy))

    // Reflecting cn over m gives the unit vector from the first to the second center.
    const dot = cnx * mx + cny * my
    const ox = 2 * dot * mx - cnx
    const oy = 2 * dot * my - cny

    const p2x = cx + -ox * r
    const p2y = cy + -oy * r
    const p4x = x2 - (p2x - x1)
    const p4y = y2 - (p2y - y1)
    return new CirclePath(tx, ty, [
        { x: x1, y: y1 },
        { x: p2x, y: p2y },
        { x: p3x, y: p3y },
        { x: p4x, y: p4y },
        { x: x2, y: y2 },
    ])
}

/**
 * Returns a smooth path from (x1, y1) to (x2, y2) that starts in direction (tx, ty).
 *
 * @param width - Stroke width, which sets the minimum radius of steep curves. Without a width, the
 *     radius is NaN and path() draws the adjustment arcs as straight lines.
 */
export function makeCurve(tx: number, ty: number, x1: number, y1: number, x2: number, y2: number, width = Number.NaN): CirclePath {
    const [fx, fy] = toFrame(tx, ty, x2 - x1, y2 - y1)
    if (fy === 0) {
        return linePath(tx, ty, x1, y1, x2, y2)
    }

    const slope = fy / fx
    if (-MAX_DOUBLE_ARC_SLOPE <= slope && slope <= MAX_DOUBLE_ARC_SLOPE) {
        return doubleArcPath(tx, ty, x1, y1, x2, y2)
    }
    return doubleArcAdjustPath(tx, ty, x1, y1, x2, y2, width)
}
