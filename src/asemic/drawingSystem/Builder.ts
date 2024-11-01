import { cloneDeep, last, max, min } from 'lodash'
import { PointVector } from './PointVector'
import * as THREE from 'three'
import { Vector2 } from 'three'
import { lerp } from 'three/src/math/MathUtils.js'

const vector = new THREE.Vector2()
const vector2 = new THREE.Vector2()

export default abstract class Builder {
  protected originSet: Coordinate = [0, 0]
  protected rotationSet: number = 0
  protected gridSet: Coordinate = [100, 100]
  protected scaleSet: Coordinate = [100, 100]
  protected matrices: THREE.Matrix3[] = []
  frames: { groups: PointVector[][][] }[] = [{ groups: [] }]
  protected targetFramesSet: [number, number] = [0, 0]
  protected targetGroupsSet: [number, number] = [0, 0]
  protected modeSet: 'absolute' | 'relative' | 'polar' | 'steer' | 'intersect' =
    'absolute'

  constructor() {}

  protected makeCurvePath(curve: PointVector[]) {
    const path = new THREE.CurvePath()
    for (let i = 0; i < curve.length - 2; i++) {
      if (curve[i + 1].strength > 0.5) {
        path.add(
          new THREE.LineCurve(
            i === 0 ? curve[i] : curve[i].clone().lerp(curve[i + 1], 0.5),
            curve[i + 1]
          )
        )
        path.add(
          new THREE.LineCurve(
            curve[i + 1],
            i === curve.length - 3
              ? curve[i + 2]
              : curve[i + 1].clone().lerp(curve[i + 2], 0.5)
          )
        )
      } else {
        path.add(
          new THREE.QuadraticBezierCurve(
            i === 0 ? curve[i] : curve[i].clone().lerp(curve[i + 1], 0.5),
            curve[i + 1],
            i === curve.length - 3
              ? curve[i + 2]
              : curve[i + 1].clone().lerp(curve[i + 2], 0.5)
          )
        )
      }
    }
    return path
  }

  interpolateCurve(curve: PointVector[], controlPointsCount: number) {
    const newCurve = this.makeCurvePath(curve)
    const newCurvePoints: PointVector[] = []
    for (let i = 0; i < controlPointsCount; i++) {
      const u = i / (controlPointsCount - 1)
      newCurvePoints.push(
        new PointVector(
          newCurve.getPointAt(u).toArray() as [number, number],
          curve,
          i
        )
      )

      curve.splice(0, curve.length, ...newCurvePoints)
    }
  }

  log: {
    func: string
    coords?: (OpenCoordinate | Coordinate[])[]
    endArgs?: any[]
  }[] = []
  logEnabled = true
  protected addToLog(
    func: string,
    {
      coords,
      otherCoords,
      endArgs
    }: {
      coords?: (Coordinate[] | Coordinate)[]
      otherCoords?: Coordinate[]
      endArgs?: any[]
    }
  ) {
    if (!this.logEnabled) return
    this.log.push({ func, coords, endArgs })
  }

  grid(grid: Coordinate) {
    this.addToLog('grid', { endArgs: [grid] })
    this.gridSet = grid
  }

  push({
    origin = [0, 0],
    rotation = 0,
    scale = this.gridSet
  }: {
    scale?: Coordinate
    origin?: Coordinate
    rotation?: number
  }) {
    return this
    const m = new THREE.Matrix3()
    m.makeScale(scale[0] / this.gridSet[0], scale[1] / this.gridSet[1])
      .rotate(rotation * Math.PI * 2)
      .translate(origin[0] / this.gridSet[0], origin[1] / this.gridSet[1])
    this.matrices.push(m)
    return this
  }

  pop() {
    this.matrices.pop()
  }

  protected getRelative(move: Coordinate, applyMatrices = true): Coordinate {
    let lastPoint: PointVector
    let point: Coordinate

    if (move[2]?.mode) {
      // reset transforms when switching modes
      this.modeSet = move[2].mode
    }
    if (move[2]?.reset) {
      this.originSet = [0, 0]
      this.scaleSet = this.gridSet
      this.rotationSet = 0
    }
    if (move[2]?.origin) {
      const modeSave = this.modeSet
      const scaleSave = cloneDeep(this.scaleSet)
      this.scaleSet = this.gridSet
      this.originSet = [0, 0]
      const origin = this.getRelative(move[2].origin, false)
      this.originSet = [
        origin[0] * this.gridSet[0],
        origin[1] * this.gridSet[1]
      ]

      this.modeSet = modeSave
      this.scaleSet = scaleSave
    }
    if (move[2]?.grid) {
      this.gridSet = move[2].grid
    }
    if (move[2]?.rotation) {
      this.rotationSet = move[2].rotation
    }
    if (move[2]?.scale) {
      this.scaleSet = move[2].scale
    }

    const gridMove = [move[0] / this.gridSet[0], move[1] / this.gridSet[1]]

    switch (move[2]?.mode ?? this.modeSet) {
      case 'absolute':
        const moveV = vector
          .set(
            ((move[0] * this.scaleSet[0]) / this.gridSet[0] +
              (this.modeSet === 'absolute' ? this.originSet[0] : 0)) /
              this.gridSet[0],
            ((move[1] * this.scaleSet[1]) / this.gridSet[1] +
              (this.modeSet === 'absolute' ? this.originSet[1] : 0)) /
              this.gridSet[1]
          )
          .rotateAround(
            {
              x: this.originSet[0] / this.gridSet[0],
              y: this.originSet[1] / this.gridSet[1]
            },
            this.rotationSet ?? 0
          )
        if (applyMatrices)
          for (let matrix of this.matrices) {
            moveV.applyMatrix3(matrix)
          }
        point = moveV.toArray()
        break
      case 'relative':
        lastPoint = this.getLastPoint()
        point = [lastPoint.x + gridMove[0], lastPoint.y + gridMove[1]]
        break
      case 'polar':
        lastPoint = this.getLastPoint()
        point = vector
          .copy(lastPoint)
          .add({ x: gridMove[0], y: 0 })
          .rotateAround(lastPoint, gridMove[1] * Math.PI * 2)
          .toArray()
        break
      case 'steer':
        lastPoint = this.getLastPoint()
        const pointBefore = this.getLastPoint(-2)
        point = vector
          .copy(lastPoint)
          .add({ x: gridMove[0], y: 0 })
          .rotateAround(
            lastPoint,
            gridMove[1] * Math.PI * 2 +
              (!pointBefore
                ? 0
                : vector2.copy(lastPoint).sub(pointBefore).angle())
          )
          .toArray()
        break
      case 'intersect':
        move[1] =
          move[1] < 0
            ? move[1] + this.frames[0].groups[this.targetGroupsSet[0]].length
            : move[1]

        const curvePath = this.makeCurvePath(
          this.frames[0].groups[this.targetGroupsSet[0]][move[1]]
        )
        const v = curvePath.getPointAt(move[0] / this.gridSet[0])
        if (!applyMatrices) {
          // we revert the matrix transformations to get what you would pass into this function to get this point as output.
          for (let i = this.matrices.length - 1; i >= 0; i--) {
            v.applyMatrix3(this.matrices[i].clone().invert())
          }
        }
        point = v.toArray() as [number, number]
        move[2] = { ...move[2], mode: 'absolute' }
        break
    }

    return [...point, move[2] ?? {}]
  }

  protected getLastPoint(index: number = -1): PointVector {
    throw new Error('not implemented')
  }

  targetGroups(from: number, to?: number) {
    if (from < 0) from += this.frames[0].groups.length
    if (to === undefined) to = from
    else if (to < 0) to += this.frames[0].groups.length
    this.targetGroupsSet = [from, to]
    return this
  }

  eachPoint(callback: (point: PointVector) => void) {
    return this.eachGroup(group => {
      group.forEach(curve => curve.forEach(point => callback(point)))
    })
  }

  eachGroup(
    callback: (group: PointVector[][]) => void,
    fromTo?: [number, number]
  ) {
    if (fromTo) {
      this.targetGroups(fromTo[0], fromTo[1])
    }
    return this.eachFrame(frame => {
      for (let i = this.targetGroupsSet[0]; i <= this.targetGroupsSet[1]; i++) {
        callback(frame.groups[i])
      }
    })
  }

  eachFrame(
    callback: (frame: KeyframeData) => void,
    fromTo?: [number, number]
  ) {
    if (fromTo) {
      this.targetFrames(fromTo[0], fromTo[1])
    }
    for (let i = this.targetFramesSet[0]; i <= this.targetFramesSet[1]; i++) {
      callback(this.frames[i])
    }
    return this
  }

  targetFrames(from: number, to?: number) {
    throw new Error('not implemented')
  }

  debug() {
    console.log(
      cloneDeep(this.frames)
        .slice(this.targetFramesSet[0], this.targetFramesSet[1] + 1)
        .map(x =>
          x.groups
            .slice(this.targetGroupsSet[0], this.targetGroupsSet[1] + 1)
            .map(g =>
              g
                .map(c =>
                  c
                    .map(
                      p =>
                        `${p
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

  within(
    from: Coordinate,
    to: Coordinate,
    rotation?: Coordinate,
    { target = [0, -1] }: { target?: [number, number] } = {}
  ) {
    const tGroup = this.frames[0].groups[this.targetGroupsSet[0]]
    const xMap = tGroup.flat().map(x => x.x)
    const yMap = tGroup.flat().map(y => y.y)
    const minVector = new Vector2(min(xMap)!, min(yMap)!)
    const maxVector = new Vector2(max(xMap)!, max(yMap)!)

    const fromMapped = this.getRelative(from)
    const toMapped = this.getRelative(to)

    this.eachPoint(p => {
      const lerpX = (p.x - minVector.x) / (maxVector.x - minVector.x || 1)
      const lerpY = (p.y - minVector.y) / (maxVector.y - minVector.y || 1)

      p.set(
        lerp(fromMapped[0], toMapped[0], lerpX),
        lerp(fromMapped[1], toMapped[1], lerpY)
      )
    })
    return this
  }
}
