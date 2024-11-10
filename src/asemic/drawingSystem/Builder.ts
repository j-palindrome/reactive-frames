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

  getBounds(points: PointBuilder[]) {
    const flatX = points.map(x => x.x)
    const flatY = points.map(y => y.y)
    const minCoord = new Vector2(min(flatX)!, min(flatY)!)
    const maxCoord = new Vector2(max(flatX)!, max(flatY)!)
    return {
      min: minCoord,
      max: maxCoord,
      size: new Vector2().subVectors(maxCoord, minCoord)
    }
  }

  along(points: Coordinate[]) {
    const curve = this.makeCurvePath(
      points.map(x => this.)
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
