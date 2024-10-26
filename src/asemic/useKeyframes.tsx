import { Vector2 } from 'three'
import { cloneDeep, last, max, range } from 'lodash'
import { useMemo } from 'react'
import { lerp } from 'three/src/math/MathUtils.js'
import * as THREE from 'three'

const degree = 2
const targetVector = new Vector2()

export function useKeyframes(
  keyframes: Keyframes,
  {
    color = new THREE.Color(1, 1, 1),
    alpha = 1
  }: {
    color?: THREE.Color
    alpha?: number
  }
) {
  const kf = keyframes.keyframes
  const keyframeCount = kf.length
  const curveCount = kf[0].groups.flat().length

  const controlPointsCount = max(
    kf.flatMap(x => x.groups.flat()).map(x => x.length)
  )!

  const subdivisions = (controlPointsCount - degree) / (degree - 1)
  const curveLengths = useMemo(() => {
    const totalCurves = kf[0].groups.flat().length
    const curveLengths = range(totalCurves).flatMap(() => 0)

    kf.forEach(keyframe => {
      keyframe.groups.flat().forEach((curve, j) => {
        // interpolate the bezier curves which are too short
        if (curve.length < controlPointsCount) {
          let i = 0
          while (curve.length < controlPointsCount) {
            curve.splice(i + 1, 0, {
              position: curve[i].position
                .clone()
                .lerp(curve[i + 1].position, 0.5),
              thickness: lerp(
                curve[i].thickness ?? 1,
                curve[i + 1].thickness ?? 1,
                0.5
              ),
              alpha: lerp(curve[i].alpha ?? 1, curve[i + 1].alpha ?? 1, 0.5),
              curveProgress: j / totalCurves,
              pointProgress: i / (controlPointsCount - 1),
              strength: 0
            })
            i += 2
            if (i >= curve.length - 2) i -= curve.length - 2
          }
        }

        const curvePath = new THREE.CurvePath()
        const segments: THREE.Curve<Vector2>[] = []
        range(subdivisions).forEach(i => {
          const thisCurve = new THREE.QuadraticBezierCurve(
            // i === 0
            //   ? curve[i].position
            //   :
            curve[i].position.clone().lerp(curve[i + 1].position, 0.5),
            curve[i + 1].position,
            // i === subdivisions - 1
            //   ? curve[i + 2].position
            //   :
            curve[i + 1].position.clone().lerp(curve[i + 2].position, 0.5)
          )
          curvePath.add(thisCurve)
          segments.push(thisCurve)
        })

        const length = curvePath.getLength()
        // We sample each curve according to its maximum keyframe length
        if (length > curveLengths[j]) curveLengths[j] = length
      })
    })

    return curveLengths
  }, [])

  // write keyframes to 3D data texture.
  // read them into the shaders.
  const { keyframesTex, colorTex } = useMemo(() => {
    const createTexture = (
      getPoint: (point: CurvePoint) => number[],
      format: THREE.AnyPixelFormat
    ) => {
      const array = new Float32Array(
        kf.flatMap(keyframe => {
          return keyframe.groups.flatMap(group =>
            group.flatMap(curve => {
              return curve.flatMap(point => {
                return getPoint(point)
              })
            })
          )
        })
      )

      const tex = new THREE.Data3DTexture(
        array,
        controlPointsCount,
        curveCount,
        keyframeCount
      )
      tex.format = format
      tex.type = THREE.FloatType
      tex.minFilter = tex.magFilter = THREE.NearestFilter
      tex.wrapR = tex.wrapS = tex.wrapT = THREE.RepeatWrapping
      tex.needsUpdate = true
      return tex
    }

    const keyframesTex = createTexture(point => {
      return [...point.position.toArray(), point.strength, 1]
    }, THREE.RGBAFormat)

    const colorTex = createTexture(
      point => [
        ...(point.color?.toArray() ?? color.toArray()),
        point.alpha ?? alpha
      ],
      THREE.RGBAFormat
    )
    return { keyframesTex, colorTex }
  }, [kf])

  return {
    curveLengths,
    keyframesTex,
    colorTex,
    controlPointsCount,
    keyframeCount
  }
}

export class PointVector extends Vector2 {
  curve: CurvePoint[]
  index: number

  constructor(
    points: [number, number] = [0, 0],
    strength: number = 0,
    curve: CurvePoint[],
    index: number
  ) {
    super(points[0], points[1])
    this.curve = curve
    this.index = index
  }

  twist(from: Coordinate, amount: number) {
    this.rotateAround(vector.set(...from), amount * Math.PI * 2)
    return this
  }

  pull(from: Coordinate, to: Coordinate, amount: number) {
    this.sub(vector.set(...from))
      .lerp(vector2.set(...to), amount)
      .add(vector)
    return this
  }

  stretch(from: Coordinate, to: Coordinate) {
    this.sub(vector.set(...from))
      .multiply(vector2.set(...to).sub(vector))
      .add(vector)
    return this
  }

  randomize(amount: [number, number] = [1, 1]) {
    const v = new Vector2(...amount)
    const ang =
      (this.index
        ? this.curve[this.index - 1].position.angleTo(this)
        : this.angleTo(this.curve[1].position)) +
      0.5 * Math.PI * 2
    this.add(
      vector
        .random()
        .subScalar(0.5)
        .multiply(v)
        .rotateAround({ x: 0, y: 0 }, ang)
    )
    return this
  }

  grid(size: Vector2, grid: Vector2, progress: number) {
    progress *= grid[0] * grid[1]
    const gridV = vector
      .set((progress % grid[0]) / grid[0], Math.floor(progress % grid[1]))
      .divide(grid)
    this.add(gridV.multiply(size))
    return this
  }
}

const vector = new Vector2()
const vector2 = new Vector2()
const vector3 = new Vector2()
export class Keyframes {
  keyframes: KeyframeData[]
  private targetFrames: [number, number]
  private targetGroups: [number, number]
  curveCounts: number[]
  pointCount: number

  constructor(curveCounts: number[], pointCount: number) {
    this.keyframes = []
    this.targetGroups = [0, curveCounts.length]
    this.targetFrames = [0, 0]
    this.curveCounts = curveCounts
    this.pointCount = pointCount

    this.addFrame(0)
  }

  debug() {
    console.log(
      cloneDeep(this.keyframes)
        .slice(this.targetFrames[0], this.targetFrames[1] + 1)
        .map(x =>
          x.groups
            .slice(this.targetGroups[0], this.targetGroups[1] + 1)
            .map(g =>
              g
                .map(c =>
                  c
                    .map(
                      p =>
                        `${p.position
                          .toArray()
                          .map(p => Math.floor(p * 100))
                          .join(',')}`
                    )
                    .join(' ')
                )
                .join('\n')
            )
            .join('\n\n')
        )
        .join('\n\n')
    )
    return this
  }

  copyFrame(keyframe: number, copyCount: number = 1) {
    if (keyframe < 0) keyframe += this.keyframes.length
    for (let i = 0; i < copyCount; i++) {
      this.keyframes.push(cloneDeep(this.keyframes[keyframe]))
    }
    this.targetFrames = [keyframe + 1, this.keyframes.length - 1]
    return this
  }

  addFrame(keyframe: number, addCount: number = 1) {
    if (keyframe < 0) keyframe += this.keyframes.length
    for (let i = 0; i < addCount; i++) {
      this.keyframes.push({
        groups: this.curveCounts.map(curveCount =>
          range(curveCount).map(curveI => {
            const thisCurve: CurvePoint[] = []
            for (let i = 0; i < this.pointCount; i++) {
              thisCurve.push({
                position: new PointVector([0, 0], 0, thisCurve, i),
                pointProgress: i / (this.pointCount - 1 || 1),
                curveProgress: curveI / (curveCount - 1 || 1),
                strength: 0
              })
            }
            return thisCurve
          })
        )
      })
    }
    this.targetFrames = [keyframe + 1, this.keyframes.length - 1]
    return this
  }

  interpolateFrame(keyframe: number, amount = 0.5) {
    const interpKeyframe = cloneDeep(this.keyframes[keyframe])
    interpKeyframe.groups.forEach((group, groupI) =>
      group.forEach((x, curveI) =>
        x.forEach((point, pointI) =>
          point.position.lerp(
            this.keyframes[keyframe + 1].groups[groupI][curveI][pointI]
              .position,
            amount
          )
        )
      )
    )
    this.keyframes.splice(keyframe + 1, 0, interpKeyframe)
    return this
  }

  targetFrame(from: number, to?: number) {
    if (from < 0) from += this.keyframes.length
    if (to === undefined) to = from
    else if (to < 0) to += this.keyframes.length
    this.targetFrames = [from, to]
    return this
  }

  targetGroup(from: number, to?: number) {
    if (from < 0) from += this.curveCounts.length
    if (to === undefined) to = from
    else if (to < 0) to += this.curveCounts.length
    this.targetGroups = [from, to]
    return this
  }

  eachFrame(callback: (frame: KeyframeData) => void) {
    for (let i = this.targetFrames[0]; i <= this.targetFrames[1]; i++) {
      callback(this.keyframes[i])
    }
    return this
  }

  eachGroup(callback: (curve: CurvePoint[]) => void) {
    return this.eachFrame(frame => {
      for (let i = this.targetGroups[0]; i <= this.targetGroups[1]; i++) {
        for (let curve of frame.groups[i]) {
          callback(curve)
        }
      }
    })
  }

  eachPoint(callback: (point: CurvePoint) => void) {
    return this.eachGroup(curve => {
      curve.forEach(point => callback(point))
    })
  }
}
