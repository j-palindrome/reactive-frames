import { Vector2 } from 'three'
import { cloneDeep, last, max, range } from 'lodash'
import { useMemo } from 'react'
import { lerp } from 'three/src/math/MathUtils.js'
import * as THREE from 'three'

const degree = 2
const targetVector = new Vector2()

export function useKeyframes({
  keyframes,
  color = new THREE.Color(1, 1, 1),
  alpha = 1
}: {
  keyframes: Keyframes['keyframes']
  color?: THREE.Color
  alpha?: number
}) {
  const keyframeCount = keyframes.length
  const curveCount = keyframes[0].curves.length

  const controlPointsCount = max(
    keyframes.flatMap(x => x.curves).map(x => x.length)
  )!

  const subdivisions = (controlPointsCount - degree) / (degree - 1)
  const curveLengths = useMemo(() => {
    const curveLengths = range(keyframes[0].curves.length).flatMap(() => 0)

    keyframes.forEach(keyframe => {
      return keyframe.curves.map((curve, j) => {
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
              curveProgress: j / keyframe.curves.length,
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
        keyframes.flatMap(keyframe => {
          return keyframe.curves.flatMap(curve => {
            return curve.flatMap(point => {
              return getPoint(point)
            })
          })
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
  }, [keyframes])

  return {
    curveLengths,
    keyframesTex,
    colorTex,
    controlPointsCount,
    keyframeCount,
    type: '3d' as '3d'
  }
}

class PointVector extends Vector2 {
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

  twist(from: Vector2, amount: number) {
    this.rotateAround(from, amount * Math.PI * 2)
    return this
  }

  pull(from: Vector2, to: Vector2, amount: number) {
    this.sub(from).lerp(to, amount).add(from)
    return this
  }

  stretch(from: Vector2, amount: Vector2) {
    this.sub(from).multiply(amount).add(from)
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
export class Keyframes {
  keyframes: KeyframeData[]
  targetFrames: [number, number]
  targetCurves: [number, number]
  curveCount: number
  pointCount: number

  then(frame?: Omit<KeyframeData, 'curves'>) {
    const newKeyframe = {
      ...cloneDeep(last(this.keyframes)),
      ...frame
    } as KeyframeData
    this.keyframes.push(newKeyframe)
    this.target(-1)
    return this
  }

  constructor(curveCount: number, pointCount: number) {
    this.keyframes = []
    this.targetCurves = [0, curveCount]
    this.targetFrames = [0, 0]
    this.curveCount = curveCount
    this.pointCount = pointCount

    this.add(0)
  }

  debug(start: number = 0, end: number = 1) {
    console.log(
      cloneDeep(this.keyframes)
        .map(x =>
          x.curves
            .slice(start, end)
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
    return this
  }

  copy(keyframe: number, copyCount: number = 1) {
    if (keyframe < 0) keyframe += this.keyframes.length
    for (let i = 0; i < copyCount; i++) {
      this.keyframes.push(cloneDeep(this.keyframes[keyframe]))
    }
    this.targetFrames = [keyframe + 1, this.keyframes.length - 1]
    return this
  }

  add(keyframe: number, addCount: number = 1) {
    if (keyframe < 0) keyframe += this.keyframes.length
    for (let i = 0; i < addCount; i++) {
      this.keyframes.push({
        curves: range(this.curveCount).map(curveI => {
          const thisCurve: CurvePoint[] = []
          for (let i = 0; i < this.pointCount; i++) {
            thisCurve.push({
              position: new PointVector([0, 0], 0, thisCurve, i),
              pointProgress: i / (this.pointCount - 1 || 1),
              curveProgress: curveI / (this.curveCount - 1 || 1),
              strength: 0
            })
          }
          return thisCurve
        })
      })
    }
    this.targetFrames = [keyframe + 1, this.keyframes.length - 1]
    return this
  }

  interpolate(keyframe: number, amount = 0.5) {
    const interpKeyframe = cloneDeep(this.keyframes[keyframe])
    interpKeyframe.curves.forEach((x, curveI) =>
      x.forEach((point, pointI) =>
        point.position.lerp(
          this.keyframes[keyframe + 1].curves[curveI][pointI].position,
          amount
        )
      )
    )
    this.keyframes.splice(keyframe + 1, 0, interpKeyframe)
    return this
  }

  target(from: number, to?: number) {
    if (from < 0) from += this.keyframes.length
    if (to === undefined) to = from
    else if (to < 0) to += this.keyframes.length
    this.targetFrames = [from, to]
    return this
  }

  set(setCurve: [number, number][]) {
    this.eachFrame(frame => {
      for (let i = this.targetCurves[0]; i < this.targetCurves[1]; i++) {
        const curve = frame.curves[i]
        curve.forEach((point, i) => {
          point.position.set(setCurve[i][0], setCurve[i][1])
        })
      }
    })

    return this
  }

  eachFrame(callback: (frame: KeyframeData) => void) {
    for (let i = this.targetFrames[0]; i <= this.targetFrames[1]; i++) {
      callback(this.keyframes[i])
    }
    return this
  }

  eachCurve(callback: (curve: CurvePoint[]) => void) {
    return this.eachFrame(frame => {
      for (let i = this.targetCurves[0]; i < this.targetCurves[1]; i++) {
        const curve = frame.curves[i]
        callback(curve)
      }
    })
  }

  eachPoint(callback: (point: CurvePoint) => void) {
    return this.eachFrame(frame => {
      for (let i = this.targetCurves[0]; i < this.targetCurves[1]; i++) {
        const curve = frame.curves[i]
        curve.forEach((point, i) => {
          callback(point)
        })
      }
    })
  }
}
