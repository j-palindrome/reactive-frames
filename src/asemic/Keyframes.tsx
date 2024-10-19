import { cloneDeep, last, range } from 'lodash'
import { Vector2 } from 'three'
import { lerp } from 'three/src/math/MathUtils.js'

const scale = (i: number, from = 0, to = 1, exp = 1) => {
  return i * (to - from) ** exp + from
}

type Coord = [number, number]
export default class Keyframes {
  keyframes: {
    curves: Point[][]
    position?: Vector2
    scale?: Vector2
    rotation?: number
  }[]

  targetFrame: number
  targetCurves: [number, number]
  curveCount: number
  vector: Vector2

  then(time: number, timeCurve?: number) {
    this.keyframes.push(cloneDeep(last(this.keyframes)!))
    this.targetFrame += 1
    return this
  }

  constructor(curveCount: number, pointCount: number) {
    this.keyframes = [
      {
        curves: range(curveCount).map(i =>
          range(pointCount).map(i => ({ position: new Vector2() }))
        )
      }
    ]
    this.targetCurves = [0, curveCount]
    this.targetFrame = 0
    this.curveCount = curveCount
    this.vector = new Vector2()
  }

  clear() {
    this.iterate(curve => {
      curve.splice(1, curve.length - 1)
      curve[0] = { position: new Vector2() }
    })
    return this
  }

  line(end: Coord) {
    const addition = new Vector2(...end)
    const halfway = new Vector2().lerpVectors(new Vector2(), addition, 0.5)
    this.iterate(curve => {
      const lastPoint = last(curve)!
      curve.forEach(
        point => {
          position: new Vector2().addVectors(lastPoint.position, halfway)
        },
        {
          position: new Vector2().addVectors(lastPoint.position, addition)
        }
      )
    })
    return this
  }

  curve(midpoint: Coord, end: Coord) {
    const mp = new Vector2(...midpoint)
    const ep = new Vector2(...end)
    this.iterate(curve => {
      const lastPoint = last(curve)!
      curve.push(
        { position: new Vector2().addVectors(lastPoint.position, mp) },
        { position: new Vector2().addVectors(lastPoint.position, ep) }
      )
    })
    return this
  }

  spiral(rotations: number, distance: number) {
    // const eachRotation = 0.25 * Math.PI * 2
    const ROTATIONS = 8
    const numVectors = rotations * ROTATIONS
    this.iterate((curve, index) => {
      let thisDistance = 0
      const lastPoint = last(curve)!.position
      let angle = 0
      for (let i = 0; i < numVectors; i++) {
        angle = (angle + 1 / ROTATIONS) % 1
        thisDistance += distance / numVectors
        curve.push({
          position: new Vector2(0, thisDistance)
            .rotateAround({ x: 0, y: 0 }, angle * Math.PI * 2)
            .add(lastPoint)
        })
      }
    })
    return this
  }

  random(variation: Coord) {
    const variationV = new Vector2(...variation)
    this.iterate((curve, i) => {
      curve.forEach((point, i) => {
        const heading = curve[i + 1]
          ? point.position.angleTo(curve[i + 1].position)
          : curve[i - 1].position.angleTo(point.position)
        point.position.add(
          this.vector
            .random()
            .subScalar(0.5)
            .multiply(variationV.clone().rotateAround({ x: 0, y: 0 }, heading))
        )
      })
    })
    return this
  }

  rotate(from: number, to?: number) {
    if (to === undefined) to = from
    this.iterate((curve, progress) => {
      curve.forEach(point => {
        point.position.rotateAround(
          curve[0].position,
          scale(progress, from, to) * Math.PI * 2
        )
      })
    })
    return this
  }

  scale(from: Coord, to?: Coord) {
    if (to === undefined) to = from
    const fromV = new Vector2(...from)
    const toV = new Vector2(...to)
    this.iterate((curve, progress) => {
      const startPos = curve[0].position.clone()
      curve.forEach(point => {
        point.position
          .sub(curve[0].position)
          .multiply(this.vector.lerpVectors(fromV, toV, progress))
      })
    })
    return this
  }

  translate(from: Coord, to?: Coord) {
    if (to === undefined) to = from
    const fromV = new Vector2(...from)
    const toV = new Vector2(...to)
    this.iterate((curve, progress) => {
      curve.forEach(point => {
        point.position.add(this.vector.lerpVectors(fromV, toV, progress))
      })
    })
    return this
  }

  private iterate(callback: (curve: Point[], progress: number) => void) {
    const total = this.targetCurves[1] - this.targetCurves[0]
    for (let i = this.targetCurves[0]; i < this.targetCurves[1]; i++) {
      const curve = this.keyframes[this.targetFrame].curves[i]
      const progress = i / total
      callback(curve, progress)
    }
  }
}
