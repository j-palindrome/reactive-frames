import { cloneDeep, last, max, min } from 'lodash'
import { PointBuilder } from './PointBuilder'
import * as THREE from 'three'
import { Vector2 } from 'three'
import { lerp } from 'three/src/math/MathUtils.js'
import { e, modeDependencies } from 'mathjs'
import invariant from 'tiny-invariant'

const vector = new THREE.Vector2()
const vector2 = new THREE.Vector2()
const relativeVector = new THREE.Vector2()
const relativeVector2 = new THREE.Vector2()
type TargetInfo = [number, number] | number
export default abstract class Builder {
  protected translateSet: Vector2 = new Vector2(0, 0)
  protected rotateSet: number = 0
  protected originSet: Vector2 = new Vector2(0, 0)
  protected gridSet: [number, number] = [100, 100]
  protected scaleSet: Vector2 = new Vector2(1, 1)
  protected matrices: THREE.Matrix3[] = []
  protected targetFramesSet: [number, number] = [0, 0]
  protected targetGroupsSet: [number, number] = [0, 0]
  protected modeSet: 'absolute' | 'relative' | 'polar' | 'steer' | 'intersect' =
    'absolute'
  log: {
    func: string
    coords?: (Coordinate | Coordinate[])[]
    endArgs?: any[]
  }[] = []
  logEnabled = true
  framesSet: {
    groups: GroupData[]
    transform: TransformData
  }[] = [{ groups: [], transform: {} }]

  applyGrid(point: Coordinate): Coordinate {
    return [point[0] * this.gridSet[0], point[1] * this.gridSet[1], point[2]]
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
    this.translateSet.set(0, 0)
    this.scaleSet.set(1, 1)
    this.rotateSet = 0
    this.modeSet = 'absolute'
  }

  coordinateToVector(c: Coordinate) {
    return new Vector2(c[0], c[1])
  }

  resetTransforms() {
    this.translateSet.set(0, 0)
    this.scaleSet.set(1, 1)
    this.rotateSet = 0
    this.originSet.set(0, 0)
  }

  lastPoint: Vector2 = new Vector2(0, 0)
  /**
   * translate->scale->rotate
   */
  getRelative(
    move: Coordinate,
    {
      reverseMatrices = false,
      applyGrid: applyGridToInput = false,
      skipTransforms = false,
      applyGridToOutput = false
    } = {}
  ): Coordinate {
    if (applyGridToInput) {
      this.applyGrid(move)
    }
    let modeSave: Builder['modeSet'] | undefined = undefined,
      scaleSave: Vector2 | undefined = undefined,
      translateSave: Vector2 | undefined = undefined,
      originSave: Vector2 | undefined = undefined,
      rotateSave: number | undefined = undefined
    if (skipTransforms) {
      modeSave = this.modeSet
      scaleSave = this.scaleSet.clone()
      rotateSave = this.rotateSet
      translateSave = this.translateSet.clone()
      originSave = this.originSet.clone()
      this.scaleSet.set(1, 1)
      this.translateSet.set(0, 0)
      this.originSet.set(0, 0)
      this.rotateSet = 0
      this.modeSet = 'absolute'
    }
    if (move[2]?.mode) {
      // reset transforms when switching modes
      this.modeSet = move[2].mode
      if (move[2]?.reset !== false) {
        this.translateSet.set(0, 0)
        this.scaleSet.set(1, 1)
        this.rotateSet = 0
        this.originSet.set(0, 0)
      }
    }
    if (move[2]?.reset) {
      this.resetTransforms()
    }

    if (move[2]?.grid) {
      this.gridSet = move[2].grid
    }

    if (move[2]?.origin) {
      const newPoint = this.getRelative(move[2].origin, {
        reverseMatrices: true,
        skipTransforms: true
      })
      this.originSet.set(newPoint[0], newPoint[1])
    }

    if (move[2]?.translate) {
      const newPoint = this.getRelative(move[2].translate, {
        reverseMatrices: true,
        skipTransforms: true
      })
      this.translateSet.set(newPoint[0], newPoint[1])
    }
    if (move[2]?.rotate) {
      this.rotateSet = (move[2].rotate / this.gridSet[0]) * Math.PI * 2
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
        relativeVector
          .set(gridMove[0], gridMove[1])
          .sub(this.originSet)
          .multiply(this.scaleSet)
          .rotateAround({ x: 0, y: 0 }, this.rotateSet)
          .add(this.translateSet)
          .add(this.originSet)

        if (!reverseMatrices) {
          for (let matrix of this.matrices) {
            relativeVector.applyMatrix3(matrix)
          }
        }
        break
      case 'relative':
        relativeVector
          .set(gridMove[0], gridMove[1])
          .sub(this.originSet)
          .multiply(this.scaleSet)
          .rotateAround({ x: 0, y: 0 }, this.rotateSet)
          .add(this.translateSet)
          .add(this.originSet)
          .add(this.lastPoint)
        break
      case 'polar':
        relativeVector
          .set(gridMove[0], 0)
          .sub(this.originSet)
          .rotateAround(
            { x: 0, y: 0 },
            gridMove[1] * Math.PI * 2 + this.rotateSet
          )
          .multiply(this.scaleSet)
          .add(this.translateSet)
          .add(this.originSet)
          .add(this.lastPoint)

        break
      case 'steer':
        const pointBefore = this.getLastPoint(-2)
        relativeVector
          .set(gridMove[0], 0)
          .sub(this.originSet)
          .rotateAround(
            {
              x: 0,
              y: 0
            },
            gridMove[1] * Math.PI * 2 +
              this.rotateSet +
              relativeVector2.copy(this.lastPoint).sub(pointBefore).angle()
          )
          .multiply(this.scaleSet)
          .add(this.translateSet)
          .add(this.originSet)
          .add(this.lastPoint)
        break
      case 'intersect':
        move[1] =
          move[1] < 0
            ? move[1] +
              this.framesSet[0].groups[this.targetGroupsSet[0]].curves.length
            : move[1]

        const curvePath: THREE.CurvePath<Vector2> = this.makeCurvePath(
          this.framesSet[0].groups[this.targetGroupsSet[0]].curves[move[1]]
        )

        const pathPoint = curvePath.getPointAt(gridMove[0])
        if (reverseMatrices) {
          // we revert the matrix transformations to get what you would pass into this function to get this point as output.
          for (let i = this.matrices.length - 1; i >= 0; i--) {
            pathPoint.applyMatrix3(this.matrices[i].clone().invert())
          }
        }

        relativeVector
          .copy(pathPoint)
          .sub(this.originSet)
          .multiply(this.scaleSet)
          .rotateAround({ x: 0, y: 0 }, this.rotateSet)
          .add(this.translateSet)
          .add(this.originSet)
        break
    }

    const point = relativeVector.toArray()

    if (skipTransforms) {
      invariant(
        modeSave &&
          scaleSave &&
          translateSave &&
          originSave &&
          rotateSave !== undefined
      )
      this.modeSet = modeSave
      this.scaleSet.copy(scaleSave)
      this.translateSet.copy(translateSave)
      this.originSet.copy(originSave)
      this.rotateSet = rotateSave
    }

    this.lastPoint.set(point[0], point[1])
    return applyGridToOutput
      ? this.applyGrid([this.lastPoint.x, this.lastPoint.y, move[2]])
      : [this.lastPoint.x, this.lastPoint.y, move[2]]
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

  protected toCurve(points: Coordinate[], { getRelative = false } = {}) {
    return points.map(
      point =>
        new PointBuilder(getRelative ? this.getRelative(point) : point, this, {
          strength: point[2]?.strength
        })
    )
  }

  getBounds(points: PointBuilder[], { applyGrid = true } = {}) {
    const flatX = points.map(x => x.x * (applyGrid ? this.gridSet[0] : 1))
    const flatY = points.map(y => y.y * (applyGrid ? this.gridSet[1] : 1))
    const minCoord: Coordinate = [min(flatX)!, min(flatY)!]
    const maxCoord: Coordinate = [max(flatX)!, max(flatY)!]
    return {
      min: minCoord,
      max: maxCoord,
      size: [maxCoord[0] - minCoord[0], maxCoord[1] - minCoord[1]] as Coordinate
    }
  }

  along(points: Coordinate[]) {
    const curve = this.makeCurvePath(
      this.toCurve(points, { getRelative: true })
    )
    return this.groups((g, { groupProgress }) => {
      const curveProgress = curve.getPointAt(groupProgress)
      const { min } = this.getBounds(g.curves.flat(), { applyGrid: false })
      g.curves.flat().forEach(p => {
        p.add({ x: curveProgress.x - min[0], y: curveProgress.y - min[1] })
      })
    })
  }

  randomize(
    {
      translate,
      rotate,
      scale,
      origin
    }: {
      translate?: [Coordinate, Coordinate]
      rotate?: [number, number]
      scale?: [Coordinate, Coordinate]
      origin?: Coordinate
    },
    groups: TargetInfo = [0, -1],
    frames?: TargetInfo
  ) {
    this.groups(
      (g, { bounds }) => {
        let translatePoint: Coordinate = !translate
          ? [0, 0]
          : this.applyGrid(
              vector
                .set(...(this.getRelative(translate[0]) as [number, number]))
                .lerp(
                  vector2.set(
                    ...(this.getRelative(translate[1]) as [number, number])
                  ),
                  Math.random()
                )
                .toArray()
            )
        let rotatePoint: number = rotate
          ? lerp(
              rotate[0] * this.gridSet[0],
              rotate[1] * this.gridSet[0],
              Math.random()
            )
          : 0
        let scalePoint = this.applyGrid(
          !scale
            ? [1, 1]
            : vector
                .set(...(this.getRelative(scale[0]) as [number, number]))
                .lerp(
                  vector2.set(
                    ...(this.getRelative(scale[1]) as [number, number])
                  ),
                  Math.random()
                )
                .toArray()
        ) as [number, number]
        const originPoint = !origin ? [0, 0] : this.getRelative(origin)

        g.curves.flat().forEach(p =>
          p.warp({
            translate: translatePoint,
            rotate: rotatePoint,
            scale: scalePoint,
            origin: [
              bounds.min[0] + originPoint[0],
              bounds.min[1] + originPoint[1]
            ]
          })
        )
      },
      groups,
      frames
    )
    return this
  }

  points(
    callback: (
      point: PointBuilder,
      {
        keyframeProgress,
        groupProgress,
        curveProgress,
        pointProgress
      }: {
        keyframeProgress: number
        groupProgress: number
        curveProgress: number
        pointProgress: number
      }
    ) => void,
    groups?: TargetInfo,
    frames?: TargetInfo
  ) {
    this.target(groups, frames)
    return this.curves(
      (curve, { keyframeProgress, groupProgress, curveProgress }) => {
        curve.forEach((point, i) =>
          callback(point, {
            keyframeProgress,
            groupProgress,
            curveProgress,
            pointProgress: i / curve.length
          })
        )
      }
    )
  }

  curves(
    callback: (
      curve: PointBuilder[],
      {
        keyframeProgress,
        groupProgress
      }: {
        keyframeProgress: number
        groupProgress: number
        curveProgress: number
        bounds: ReturnType<Builder['getBounds']>
      }
    ) => void,
    groups?: [number, number] | number,
    frames?: [number, number] | number
  ) {
    this.target(groups, frames)
    return this.groups((group, { keyframeProgress, groupProgress }) => {
      group.curves.forEach((curve, i) =>
        callback(curve, {
          keyframeProgress,
          groupProgress,
          curveProgress: i / group.curves.length,
          bounds: this.getBounds(curve)
        })
      )
    })
  }

  groups(
    callback: (
      group: GroupData,
      {
        keyframeProgress,
        groupProgress,
        bounds
      }: {
        groupProgress: number
        keyframeProgress: number
        bounds: ReturnType<Builder['getBounds']>
      }
    ) => void,
    groups?: [number, number] | number,
    frames?: [number, number] | number
  ) {
    this.target(groups, frames)
    const groupCount = this.framesSet[0].groups.length

    return this.frames((frame, { keyframeProgress }) => {
      for (let i = this.targetGroupsSet[0]; i <= this.targetGroupsSet[1]; i++) {
        callback(frame.groups[i], {
          groupProgress: i / groupCount,
          keyframeProgress,
          bounds: this.getBounds(frame.groups[i].curves.flat())
        })
      }
    })
  }

  frames(
    callback: (
      frame: Builder['framesSet'][number],
      { keyframeProgress }: { keyframeProgress: number }
    ) => void,
    frames?: TargetInfo
  ) {
    this.target(undefined, frames)
    for (let i = this.targetFramesSet[0]; i <= this.targetFramesSet[1]; i++) {
      callback(this.framesSet[i], {
        keyframeProgress: i / this.framesSet.length
      })
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
              g.curves
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
    const xMap = tGroup.curves.flat().map(x => x.x)
    const yMap = tGroup.curves.flat().map(y => y.y)
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
