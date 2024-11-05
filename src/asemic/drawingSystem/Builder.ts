import { cloneDeep, last, max, min } from 'lodash'
import { PointBuilder } from './PointBuilder'
import * as THREE from 'three'
import { Vector2 } from 'three'
import { lerp } from 'three/src/math/MathUtils.js'
import { e } from 'mathjs'

const vector = new THREE.Vector2()
const vector2 = new THREE.Vector2()
type TargetInfo = [number, number] | number
export default abstract class Builder {
  protected originSet: Vector2 = new Vector2(0, 0)
  protected rotationSet: number = 0
  protected gridSet: [number, number] = [100, 100]
  protected scaleSet: Vector2 = new Vector2(1, 1)
  protected matrices: THREE.Matrix3[] = []
  protected targetFramesSet: [number, number] = [0, 0]
  protected targetGroupsSet: [number, number] = [0, 0]
  protected modeSet: 'absolute' | 'relative' | 'polar' | 'steer' | 'intersect' =
    'absolute'
  log: {
    func: string
    coords?: (OpenCoordinate | Coordinate[])[]
    endArgs?: any[]
  }[] = []
  logEnabled = true
  framesSet: { groups: PointBuilder[][][] }[] = [{ groups: [] }]

  applyGrid(point: Coordinate): Coordinate {
    return [point[0] * this.scaleSet[0], point[1] * this.scaleSet[1], point[2]]
  }

  constructor() {}

  protected makeCurvePath(
    curve: PointBuilder[]
  ): THREE.CurvePath<THREE.Vector2> {
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
    // @ts-ignore
    return path
  }

  interpolateCurve(curve: PointBuilder[], controlPointsCount: number) {
    const newCurve = this.makeCurvePath(curve)
    const newCurvePoints: PointBuilder[] = []
    for (let i = 0; i < controlPointsCount; i++) {
      const u = i / (controlPointsCount - 1)
      newCurvePoints.push(
        new PointBuilder(
          newCurve.getPointAt(u).toArray() as [number, number],
          this
        )
      )

      curve.splice(0, curve.length, ...newCurvePoints)
    }
  }

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

  grid(grid: [number, number]) {
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
    const m = new THREE.Matrix3()
    m.makeScale(scale[0] / this.gridSet[0], scale[1] / this.gridSet[1])
      .rotate(rotation * Math.PI * 2)
      .translate(origin[0] / this.gridSet[0], origin[1] / this.gridSet[1])
    this.matrices.push(m)
    return this
  }

  pop() {
    this.matrices.pop()
    return this
  }

  clearMatrices() {
    this.matrices = []
    return this
  }

  protected clearTransforms() {
    this.originSet.set(0, 0)
    this.scaleSet.set(1, 1)
    this.rotationSet = 0
    this.modeSet = 'absolute'
  }

  lastPoint: Vector2 = new Vector2(0, 0)
  /**
   * translate->scale->rotate
   */
  getRelative(
    move: Coordinate,
    { reverseTransforms = false, applyGrid = false } = {}
  ): Coordinate {
    if (applyGrid) {
      this.applyGrid(move)
    }
    if (move[2]?.mode) {
      // reset transforms when switching modes
      this.modeSet = move[2].mode
      if (move[2]?.reset !== false) {
        this.originSet.set(0, 0)
        this.scaleSet.set(1, 1)
        this.rotationSet = 0
      }
    }
    if (move[2]?.reset) {
      this.originSet.set(0, 0)
      this.scaleSet.set(1, 1)
      this.rotationSet = 0
    }
    if (move[2]?.origin) {
      const modeSave = this.modeSet
      const scaleSave = this.scaleSet.clone()
      this.scaleSet.set(1, 1)
      this.originSet.set(0, 0)
      const newPoint = this.getRelative(move[2].origin, {
        reverseTransforms: true
      })
      this.originSet.set(newPoint[0], newPoint[1])
      this.modeSet = modeSave
      this.scaleSet.copy(scaleSave)
    }
    if (move[2]?.grid) {
      this.gridSet = move[2].grid
    }
    if (move[2]?.rotation) {
      this.rotationSet = move[2].rotation * Math.PI * 2
    }
    if (move[2]?.scale) {
      this.scaleSet.set(
        move[2].scale[0] / this.gridSet[0],
        move[2].scale[1] / this.gridSet[1]
      )
    }

    const gridMove = [move[0] / this.gridSet[0], move[1] / this.gridSet[1]]

    switch (this.modeSet) {
      case 'absolute':
        vector
          .set(gridMove[0], gridMove[1])
          .multiply(this.scaleSet)
          .add(this.originSet)
          .rotateAround(this.originSet, this.rotationSet)

        if (!reverseTransforms) {
          for (let matrix of this.matrices) {
            vector.applyMatrix3(matrix)
          }
        }
        break
      case 'relative':
        vector
          .set(gridMove[0], gridMove[1])
          .multiply(this.scaleSet)
          .add(this.originSet)
          .rotateAround(this.originSet, this.rotationSet)
          .add(this.lastPoint)
        break
      case 'polar':
        vector
          .set(gridMove[0], 0)
          .rotateAround(
            {
              x: 0,
              y: 0
            },
            gridMove[1] * Math.PI * 2 + this.rotationSet
          )
          .multiply(this.scaleSet)
          .add(this.originSet)
          .add(this.lastPoint)

        break
      case 'steer':
        const pointBefore = this.getLastPoint(-2)
        vector
          .set(gridMove[0], 0)
          .rotateAround(
            {
              x: 0,
              y: 0
            },
            gridMove[1] * Math.PI * 2 +
              this.rotationSet +
              vector2.copy(this.lastPoint).sub(pointBefore).angle()
          )
          .multiply(this.scaleSet)
          .add(this.originSet)
          .add(this.lastPoint)
        break
      case 'intersect':
        move[1] =
          move[1] < 0
            ? move[1] + this.framesSet[0].groups[this.targetGroupsSet[0]].length
            : move[1]

        const curvePath: THREE.CurvePath<Vector2> = this.makeCurvePath(
          this.framesSet[0].groups[this.targetGroupsSet[0]][move[1]]
        )

        const pathPoint = curvePath.getPointAt(gridMove[0])
        if (reverseTransforms) {
          // we revert the matrix transformations to get what you would pass into this function to get this point as output.
          for (let i = this.matrices.length - 1; i >= 0; i--) {
            pathPoint.applyMatrix3(this.matrices[i].clone().invert())
          }
        }

        vector
          .copy(pathPoint)
          .sub(this.originSet)
          .multiply(this.scaleSet)
          .add(this.originSet)
          .add(this.originSet)
          .rotateAround(this.originSet, this.rotationSet)
        break
    }

    const point = vector.toArray()

    this.lastPoint.set(point[0], point[1])
    return [this.lastPoint.x, this.lastPoint.y, move[2]]
  }

  protected getLastPoint(index: number = -1): PointBuilder {
    throw new Error('not implemented')
  }

  protected target(groups?: TargetInfo, frames?: TargetInfo) {
    const targetGroups = (from: number, to?: number) => {
      if (from < 0) from += this.framesSet[0].groups.length
      if (to === undefined) to = from
      else if (to < 0) to += this.framesSet[0].groups.length
      this.targetGroupsSet = [from, to]
      return this
    }
    const targetFrames = (from: number, to?: number) => {
      if (from < 0) from += this.framesSet.length
      if (to === undefined) to = from
      else if (to < 0) to += this.framesSet.length
      this.targetFramesSet = [from, to]
      return this
    }
    if (typeof groups !== 'undefined') {
      if (typeof groups === 'number') targetGroups(groups)
      else targetGroups(groups[0], groups[1])
    }
    if (typeof frames !== 'undefined') {
      if (typeof frames === 'number') targetFrames(frames)
      else targetFrames(frames[0], frames[1])
    }
  }

  points(
    callback: (point: PointBuilder) => void,
    groups?: TargetInfo,
    frames?: TargetInfo
  ) {
    this.target(groups, frames)
    return this.groups(group => {
      group.forEach(curve => curve.forEach(point => callback(point)))
    })
  }

  curves(
    callback: (curve: PointBuilder[]) => void,
    groups?: [number, number] | number,
    frames?: [number, number] | number
  ) {
    this.target(groups, frames)
    return this.frames(frame => {
      for (let i = this.targetGroupsSet[0]; i <= this.targetGroupsSet[1]; i++) {
        frame.groups[i].forEach(curve => callback(curve))
      }
    })
  }

  groups(
    callback: (group: PointBuilder[][]) => void,
    groups?: [number, number] | number,
    frames?: [number, number] | number
  ) {
    this.target(groups, frames)
    return this.frames(frame => {
      for (let i = this.targetGroupsSet[0]; i <= this.targetGroupsSet[1]; i++) {
        callback(frame.groups[i])
      }
    })
  }

  frames(callback: (frame: KeyframeData) => void, frames?: TargetInfo) {
    this.target(undefined, frames)
    for (let i = this.targetFramesSet[0]; i <= this.targetFramesSet[1]; i++) {
      callback(this.framesSet[i])
    }
    return this
  }

  debug() {
    console.log(
      cloneDeep(this.framesSet)
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
    const tGroup = this.framesSet[0].groups[this.targetGroupsSet[0]]
    const xMap = tGroup.flat().map(x => x.x)
    const yMap = tGroup.flat().map(y => y.y)
    const minVector = new Vector2(min(xMap)!, min(yMap)!)
    const maxVector = new Vector2(max(xMap)!, max(yMap)!)

    const fromMapped = this.getRelative(from)
    const toMapped = this.getRelative(to)

    this.points(p => {
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
