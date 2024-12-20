import {
  AnyPixelFormat,
  Curve,
  CurvePath,
  Data3DTexture,
  DataTexture,
  FloatType,
  LineCurve,
  NearestFilter,
  QuadraticBezierCurve,
  RedFormat,
  RepeatWrapping,
  RGBAFormat,
  Vector2
} from 'three'
import { PointBuilder } from './PointBuilder'
import {
  cloneDeep,
  last,
  max,
  min,
  now,
  range,
  sortBy,
  sum,
  sumBy
} from 'lodash'
import { lerp, scale } from '@/util/src/math'
import { multiBezierProgressJS } from '@/util/src/shaders/bezier'
import Brush, { BrushSettings, Jitter } from '../Brush'
import invariant from 'tiny-invariant'

const v1 = new Vector2(),
  v2 = new Vector2(),
  v3 = new Vector2()
const curveCache = new QuadraticBezierCurve()

const SHAPES: Record<string, Coordinate[]> = {
  circle: [
    [1, 0],
    [1, 0.236],
    [0.707, 0.707],
    [0, 1],
    [-0.707, 0.707],
    [-1, 0],
    [-0.707, -0.707],
    [0, -1],
    [0.707, -0.707],
    [1, -0.236],
    [1, 0]
  ]
}

type TargetInfo = [number, number] | number
export default class Builder {
  protected transformData: TransformData = this.toTransform({})
  protected transforms: TransformData[] = []

  // the next ones being built (asynchronously)
  protected keyframe: FrameData
  protected targetGroups: [number, number] = [0, 0]
  protected initialized = false
  protected initialize: (g: Builder) => Builder
  protected settings: BrushSettings = {}

  protected reset(clear = false) {
    this.transformData = this.toTransform({})
    if (clear) this.transforms = []
  }

  protected defaultKeyframe() {
    return {
      groups: [{ curves: [[]], transform: this.toTransform({}), settings: {} }],
      transform: this.toTransform({}),
      settings: {},
      frameSettings: { duration: 1, strength: 0 }
    }
  }

  protected target(target: TargetGroups = {}) {
    const { groups, frames } = target

    const targetGroups = (from: number, to?: number) => {
      if (from < 0) from += this.keyframe.groups.length
      if (to === undefined) to = from
      else if (to < 0) to += this.keyframe.groups.length
      this.targetGroups = [from, to]
    }
    if (typeof groups !== 'undefined') {
      if (typeof groups === 'number') targetGroups(groups)
      else targetGroups(groups[0], groups[1])
    }

    return this
  }

  getLastGroup(group: number = -1, frame: number = -1) {
    if (group < 0) group += this.keyframe.groups.length

    // console.log('last group', last(this.keyframes)!.groups.length)

    return this.keyframe.groups[group]
  }

  getLastPoint(index: number = -1, curve: number = -1, group: number = -1) {
    if (group < 0) group += this.keyframe.groups.length
    if (curve < 0) curve += this.keyframe.groups[group].curves.length

    if (index < 0) {
      index += this.keyframe.groups[group].curves[curve].length
    }

    return this.keyframe.groups[group].curves[curve][index]
  }

  getIntersect(
    progress: number,
    { curve = -1, group = -1, reverseGroup = false } = {}
  ) {
    if (group < 0) group += this.keyframe.groups.length
    if (curve < 0) curve += this.keyframe.groups[group].curves.length
    if (progress < 0) progress += 1

    const curvePath = this.makeCurvePath(
      this.keyframe.groups[group].curves[curve]
    )
    const pathPoint = curvePath.getPointAt(progress)
    if (reverseGroup)
      this.applyTransformData(pathPoint, this.keyframe.groups[group].transform)
    const point = this.fromPoint(pathPoint)
    return point
  }

  protected fromPoint(point: Vector2) {
    point = point.clone()
    this.applyTransformData(point, this.transformData, true)
    return point.toArray()
  }

  protected toTransform(transform: PreTransformData): TransformData {
    const transformData: TransformData = {
      scale: new PointBuilder([1, 1]),
      rotate: 0,
      translate: new PointBuilder()
    }
    if (transform.remap) {
      v1.copy(this.toPoint(transform.remap[0]))
      v2.copy(this.toPoint(transform.remap[1]))

      const rotate = v2.clone().sub(v1).angle()
      const scale = new PointBuilder([v1.distanceTo(v2), v1.distanceTo(v2)])
      const translate = new PointBuilder().copy(v1)

      const tf: TransformData = {
        scale,
        rotate,
        translate
      }

      transform.remap = undefined
      return this.combineTransforms(tf, this.toTransform(transform))
    }
    if (transform.translate) {
      transformData.translate.add(this.toPoint(transform.translate))
    }
    if (transform.scale) {
      if (typeof transform.scale === 'number') {
        transformData.scale.multiplyScalar(transform.scale)
      } else {
        transformData.scale.multiply(this.toPoint(transform.scale))
      }
    }
    if (transform.rotate !== undefined) {
      transformData.rotate += this.toRad(transform.rotate)
    }
    return transformData
  }

  protected toPoint(coordinate: Coordinate | PointBuilder) {
    if (coordinate instanceof PointBuilder) return coordinate
    if (coordinate[2]) {
      this.setTransform(coordinate[2])
    }

    return this.applyTransformData(
      new PointBuilder([coordinate[0], coordinate[1]], coordinate[2]),
      this.transformData
    )
  }

  protected interpolateCurve(
    curve: PointBuilder[],
    controlPointsCount: number
  ) {
    const newCurve = this.makeCurvePath(curve)

    const newCurvePoints: PointBuilder[] = []
    for (let i = 0; i < controlPointsCount; i++) {
      const u = i / (controlPointsCount - 1)
      newCurvePoints.push(
        new PointBuilder(newCurve.getPointAt(u).toArray() as [number, number])
      )

      curve.splice(0, curve.length, ...newCurvePoints)
    }
  }

  combineTransforms(
    transformData: TransformData,
    nextTransformData: TransformData
  ) {
    // transformData.translate.add(
    //   nextTransformData.translate
    //     .multiply(transformData.scale)
    //     .rotateAround({ x: 0, y: 0 }, transformData.rotate)
    // )
    transformData.rotate += nextTransformData.rotate
    transformData.scale.multiply(nextTransformData.scale)
    return transformData
  }

  protected applyTransformData<T extends Vector2>(
    vector: T,
    transformData: TransformData,
    invert: boolean = false
  ): T {
    if (invert) {
      vector
        .sub(transformData.translate)
        .rotateAround({ x: 0, y: 0 }, -transformData.rotate)
        .divide(transformData.scale)
    } else {
      vector
        .multiply(transformData.scale)
        .rotateAround({ x: 0, y: 0 }, transformData.rotate)
        .add(transformData.translate)
    }

    return vector
  }

  setWarp(frame: PreTransformData & CoordinateMetaData, target?: TargetGroups) {
    this.target(target)

    this.combineTransforms(this.keyframe.transform, this.toTransform(frame))
    this.keyframe.settings = { ...this.keyframe.settings, ...frame }
  }

  setWarpGroups(
    groups: (PreTransformData & CoordinateMetaData)[],
    target?: TargetGroups
  ) {
    this.target(target)
    const transforms = groups.map(x => this.toTransform(x))
    return this.eachGroup((g, self, { groupProgress }) => {
      this.combineTransforms(
        g.transform,
        this.getTransformAt(transforms, groupProgress)
      )
      // g.settings = { ...g.settings, ...groups[i] }
    })
  }

  protected makeCurvePath(curve: PointBuilder[]): CurvePath<Vector2> {
    const path: CurvePath<Vector2> = new CurvePath()
    if (curve.length <= 1) {
      throw new Error(`Curve length is ${curve.length}`)
    }
    if (curve.length == 2) {
      path.add(new LineCurve(curve[0], curve[1]))
      return path
    }
    for (let i = 0; i < curve.length - 2; i++) {
      if (curve[i + 1].strength > 0.5) {
        path.add(
          new LineCurve(
            i === 0 ? curve[i] : curve[i].clone().lerp(curve[i + 1], 0.5),
            curve[i + 1]
          )
        )
        path.add(
          new LineCurve(
            curve[i + 1],
            i === curve.length - 3
              ? curve[i + 2]
              : curve[i + 1].clone().lerp(curve[i + 2], 0.5)
          )
        )
      } else {
        path.add(
          new QuadraticBezierCurve(
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

  protected getBounds(points: PointBuilder[], transform?: TransformData) {
    const flatX = points.map(x => x.x)
    const flatY = points.map(y => y.y)
    const minCoord = new Vector2(min(flatX)!, min(flatY)!)
    const maxCoord = new Vector2(max(flatX)!, max(flatY)!)
    if (transform) {
      this.applyTransformData(minCoord, transform)
      this.applyTransformData(maxCoord, transform)
    }
    return {
      min: minCoord,
      max: maxCoord,
      size: new Vector2().subVectors(maxCoord, minCoord),
      center: new Vector2().lerpVectors(minCoord, maxCoord, 0.5)
    }
  }

  setAlong(points: Coordinate[]) {
    const curve = this.makeCurvePath(points.map(x => this.toPoint(x)))
    return this.eachGroup((g, p, { groupProgress }) => {
      const curveProgress = curve.getPointAt(groupProgress)
      const { min } = this.getBounds(g.curves.flat(), g.transform)
      g.curves.flat().forEach(p => {
        p.add({ x: curveProgress.x - min[0], y: curveProgress.y - min[1] })
      })
    })
  }

  protected toRad(rotation: number) {
    return rotation * Math.PI * 2
  }

  protected fromRad(rotation: number) {
    return rotation / Math.PI / 2
  }

  setRandomize(
    { translate, rotate, scale }: PreTransformData,
    { groups, frames }: { groups?: TargetInfo; frames?: TargetInfo } = {}
  ) {
    this.eachGroup(
      (g, p, { bounds }) => {
        const transform = this.toTransform({
          translate,
          scale,
          rotate
        })
        g.curves.flat().forEach(p => {
          this.applyTransformData(p, transform)
        })
      },
      { groups, frames }
    )
    return this
  }

  eachPoint(
    callback: (
      point: PointBuilder,
      p: this,
      {
        groupProgress,
        curveProgress,
        pointProgress
      }: {
        groupProgress: number
        curveProgress: number
        pointProgress: number
      }
    ) => void,
    target?: TargetGroups
  ) {
    this.target(target)

    return this.eachCurve((curve, p, { groupProgress, curveProgress }) => {
      curve.forEach((point, i) =>
        callback(point, p, {
          groupProgress,
          curveProgress,
          pointProgress: i / curve.length
        })
      )
    })
  }

  eachCurve(
    callback: (
      curve: PointBuilder[],
      p: this,
      {
        groupProgress,
        curveProgress,
        bounds
      }: {
        groupProgress: number
        curveProgress: number
        bounds: ReturnType<Builder['getBounds']>
      }
    ) => void,
    target?: TargetGroups
  ) {
    this.target(target)
    return this.eachGroup((group, p, { groupProgress }) => {
      group.curves.forEach((curve, i) =>
        callback(curve, p, {
          groupProgress,
          curveProgress: i / group.curves.length,
          bounds: this.getBounds(group.curves.flat())
        })
      )
    })
  }

  eachGroup(
    callback: (
      group: GroupData,
      parent: this,
      {
        groupProgress,
        bounds
      }: {
        groupProgress: number
        bounds: ReturnType<Builder['getBounds']>
      }
    ) => void,
    { groups, frames }: { groups?: TargetInfo; frames?: TargetInfo } = {}
  ) {
    this.target({ groups, frames })
    const groupCount = this.keyframe.groups.length

    for (let i = this.targetGroups[0]; i <= this.targetGroups[1]; i++) {
      callback(this.keyframe.groups[i], this, {
        groupProgress: i / groupCount,
        bounds: this.getBounds(this.keyframe.groups[i].curves.flat())
      })
    }

    return this
  }

  debug() {
    console.log(
      this.keyframe.groups
        .slice(this.targetGroups[0], this.targetGroups[1] + 1)
        .map(
          g =>
            `*${g.transform.scale.toArray().map(x => x.toFixed(2))} @${
              g.transform.rotate / Math.PI / 2
            } +${g.transform.translate.toArray().map(x => x.toFixed(2))}
${g.curves
  .map(c =>
    c
      .map(
        p =>
          `${p
            .toArray()
            .map(p => p.toFixed(2))
            .join(',')}`
      )
      .join(' ')
  )
  .join('\n')}`
        )
        .join('\n\n')
    )
    return this
  }

  setWidth(width: number, target?: TargetGroups) {
    this.target(target)
    let minX = Infinity
    let minY = Infinity
    let maxX = 0
    this.eachGroup(group => {
      const bounds = this.getBounds(group.curves.flat(), group.transform)
      if (group.transform.translate.y < minY) minY = group.transform.translate.y
      if (group.transform.translate.x < minX) minX = group.transform.translate.x
      if (bounds.max.x > maxX) maxX = bounds.max.x
    })
    const dif = maxX - minX
    this.reset(true)
    return this.eachGroup(group => {
      group.transform.translate
        .sub({ x: minX, y: minY })
        .multiplyScalar(width / dif)
        .add({ x: minX, y: minY })
      group.transform.scale.multiplyScalar(width / dif)
    })
  }

  setWithin(from: Coordinate, to: Coordinate, target?: TargetGroups) {
    this.target(target)
    const fromV = this.toPoint(from)
    const size = new Vector2().copy(this.toPoint(to)).sub(fromV)

    this.eachGroup(g => {
      const curves = g.curves.flat()
      const bounds = this.getBounds(curves)
      curves.forEach(p => {
        p.sub(bounds.min).divide(bounds.size).multiply(size).add(fromV)
      })
    })

    return this
  }

  getTransformAt(
    transforms: TransformData[],
    progress: number,
    loop: boolean = false
  ) {
    const { t, start } = {
      start: Math.floor(progress * (transforms.length - 1)),
      t: (progress * (transforms.length - 1)) % 1
    }

    const curveInterpolate = <T extends Vector2 | number>(
      groups: T[]
      // { isStart, isEnd }: { isStart: boolean; isEnd: boolean }
    ) => {
      // if (groups[0] instanceof Vector2) {
      //   invariant(groups[1] instanceof Vector2 && groups[2] instanceof Vector2)
      //   curveCache.v0.copy(groups[0])
      //   curveCache.v1.copy(groups[1])
      //   curveCache.v2.copy(groups[2])
      //   if (!isStart) curveCache.v0.lerp(curveCache.v1, 0.5)
      //   if (!isEnd) curveCache.v2.lerp(curveCache.v1, 0.5)
      //   return curveCache.getPoint(t)
      // } else if (typeof groups[0] === 'number') {
      //   curveCache.v0.set(0, groups[0])
      //   curveCache.v1.set(0, groups[1] as number)
      //   curveCache.v2.set(0, groups[2] as number)
      //   if (!isStart) curveCache.v0.lerp(curveCache.v1, 0.5)
      //   if (!isEnd) curveCache.v2.lerp(curveCache.v1, 0.5)
      //   return curveCache.getPoint(t).y
      // }
      if (groups[0] instanceof Vector2) {
        invariant(groups[1] instanceof Vector2)
        return groups[0].clone().lerp(groups[1], t)
      } else if (typeof groups[0] === 'number') {
        invariant(typeof groups[1] === 'number')
        return lerp(groups[0], groups[1], t)
      }
    }

    // const { t, start } = multiBezierProgressJS(
    //   progress,
    //   loop ? this.keyframes.length + 2 : this.keyframes.length
    // )

    const makeBezier = <T extends keyof TransformData>(key: T) => {
      // const groups = range(3).map(
      //   i => transforms[(start + i) % transforms.length][key]
      // )

      // return curveInterpolate(groups, t, {
      //   isStart: !loop && t === 0,
      //   isEnd: !loop && t === this.keyframes.length - 3
      // })

      const groups = range(2).map(
        i => transforms[(start + i) % transforms.length][key]
      )

      return curveInterpolate(groups)
    }

    const { rotate, translate, scale } = {
      rotate: makeBezier('rotate'),
      translate: makeBezier('translate'),
      scale: makeBezier('scale')
    }

    return { rotate, translate, scale } as TransformData
  }

  protected lastCurve(callback: (curve: PointBuilder[]) => void) {
    return this.eachGroup(group => {
      callback(group.curves[group.curves.length - 1])
    })
  }

  /**
   * Slide the curve along itself to offset its start point.
   */
  setSlide(amount: number) {
    const amt = amount < 0 ? 1 + amount : amount
    return this.lastCurve(curve => {
      const path = this.makeCurvePath(curve)
      // const totalLength = path.getLength()
      const offset = curve[0].clone().sub(path.getPointAt(amount))
      curve.forEach(point => point.add(offset))
    })
  }

  newShape(type: keyof typeof SHAPES, transform?: PreTransformData) {
    if (transform) this.setTransform(transform)
    return this.lastCurve(c => {
      c.push(...SHAPES[type].map(x => this.toPoint(x)))
    })
  }

  newGroup({
    transform = {},
    settings = {}
  }: {
    transform?: PreTransformData
    settings?: GroupData['settings']
  } = {}) {
    if (this.initialized) {
      throw new Error("Can't create new groups after initialization.")
    }
    const lastGroup = last(this.keyframe.groups)!
    if (lastGroup.curves.flat().length !== 0) {
      this.keyframe.groups.push({
        curves: [[]],
        transform: transform
          ? this.toTransform(transform)
          : this.combineTransforms(
              cloneDeep(lastGroup.transform),
              this.transformData
            ),
        settings
      })
    } else {
      this.combineTransforms(lastGroup.transform, this.toTransform(transform))
      lastGroup.settings = { ...lastGroup.settings, ...settings }
    }

    this.reset(true)
    this.target({ groups: -1 })
    return this
  }

  newBlankPoints(number: number, defaultCoordinate: Coordinate = [0, 0]) {
    return this.lastCurve(c =>
      c.push(...range(number).map(x => this.toPoint(defaultCoordinate)))
    )
  }

  newCurve(...points: (Coordinate | PointBuilder)[]) {
    if (this.initialized) {
      throw new Error("Can't create new curves after initialization.")
    }
    if (last(this.keyframe.groups[this.targetGroups[0]].curves)!.length !== 0) {
      this.keyframe.groups[this.targetGroups[0]].curves.push([])
    }
    return this.newPoints(...points)
  }

  newPoints(...points: (Coordinate | PointBuilder)[]) {
    return this.lastCurve(c =>
      points.forEach(p => {
        c.push(this.toPoint(p))
      })
    )
  }

  protected letter(type: keyof Builder['letters']) {
    return this.letters[type]()
  }

  newText(str: string) {
    let lineCount = 0
    for (let letter of str) {
      if (this.letters[letter]) {
        this.newGroup()
          .letter(letter)
          .setTransform({ translate: [0.1, 0] })
      } else if (letter === '\n') {
        lineCount++
        this.setTransform({
          translate: [0, -1.1 * lineCount]
        })
      }
    }

    return this.setWidth(1, { groups: [0, -1], frames: 0 })
  }

  protected flattenGroupTransform(group: GroupData) {
    return group.curves.map(x =>
      x.map(x => this.applyTransformData(x.clone(), group.transform))
    )
  }

  setTransform(transform: PreTransformData) {
    if (transform.reset) {
      switch (transform.reset) {
        case 'pop':
          this.transformData = this.transforms.pop() ?? this.toTransform({})
          break
        case 'last':
          this.transformData = last(this.transforms) ?? this.toTransform({})
          break
        case true:
          this.transformData = this.toTransform({})
          break
      }
    }
    this.transformData = this.combineTransforms(
      this.transformData,
      this.toTransform(transform)
    )
    if (transform.push) {
      this.transforms.push(cloneDeep(this.transformData))
    }
    return this
  }

  setTransformAt(transform: PreTransformData, target: TransformData) {
    this.combineTransforms(target, this.toTransform(transform))
    return this
  }

  protected letters: Record<string, () => Builder> = {
    ' ': () => this.setTransform({ translate: [0.5, 0], push: true }),
    '\t': () => this.setTransform({ translate: [2, 0], push: true }),
    a: () =>
      this.newCurve(
        [1, 1, { scale: [0.5, 0.5] }],
        [0.5, 1.3],
        [0, 0.5],
        [0.5, -0.3],
        [1, 0]
      )
        .newCurve([0, 1, { translate: [1, 0] }], [-0.1, 0.5], [0, -0.3])
        .setSlide(0.1)
        .setWithin([0, 0, { reset: true }], [0.5, 0.6])
        .setTransform({ translate: [0.5, 0] }),
    b: () =>
      this.newCurve([0, 1], [0, 0])
        .newCurve(
          [0, 1, { scale: [0.5, 0.5] }],
          [0.5, 1.1],
          [1, 0.5],
          [0.5, -0.1],
          [0, 0]
        )
        .setWithin([0, 0, { reset: 'last' }], [0.5, 1])
        .setTransform({ translate: [0.5, 0] }),
    c: () =>
      this.newCurve(
        [1, 0.75, { scale: [0.5, 0.5] }],
        [0.9, 1],
        [0, 1],
        [0, 0],
        [0.9, 0],
        [1, 1 - 0.75]
      )
        .setWithin([0, 0, { reset: 'last' }], [0.5, 0.5])
        .setTransform({ translate: [0.5, 0], reset: 'last' }),
    d: () =>
      this.newCurve([1, 1], [1, 0])
        .newCurve(
          [0, 1, { scale: [-0.5, 0.5], translate: [1, 0] }],
          [0.5, 1.1],
          [1, 0.5],
          [0.5, -0.1],
          [0, 0]
        )
        .setWithin([0, 0, { reset: 'last' }], [0.5, 1])
        .setTransform({ translate: [0.5, 0] }),
    e: () =>
      this.newCurve([0, 0.5], [1, 0.5])
        .newCurve([1, 0.5], [1, 1], [0, 1], [0, 0], [0.9, 0], [1, 0.2])
        .setWithin([0, 0, { reset: 'last' }], [0.5, 0.5])
        .setTransform({ translate: [0.5, 0] }),
    f: () =>
      this.newCurve([0, 0], [0, 1 / 2], [0, 1], [1 / 2, 1], [1 / 2, 0.75])
        .newCurve([0, 1 / 2], [1 / 2, 1 / 2])
        .setSlide(1 / 4)
        .setWithin([0, 0, { reset: 'last' }], [1 / 2, 1])
        .setTransform({ translate: [0.35, 0] }),
    g: () =>
      this.newCurve(
        [0.5, 0.5],
        [0.5, 0],
        [0, 0],
        [0, 0.5],
        [0.3, 0.6],
        [0.5, 0.5]
      )
        .newCurve([0.5, 0.5], [0.5, 0], [0.5, -0.5], [0, -0.5], [0.05, -0.25])
        .setWithin([0, -0.5], [0.5, 0.5])
        .setTransform({ translate: [0.5, 0] }),
    h: () =>
      this.newCurve([0, 0], [0, 1])
        .newCurve([0, 0.6, { scale: [0.5, 0.7] }], [1, 1], [1, 0])
        .setTransform({ translate: [0.5, 0], reset: 'last' }),
    i: () =>
      this.setTransform({ translate: [0.2, 0] })
        .newCurve([0, 0], [0, 1, { scale: [1, 0.5] }])
        .newCurve(
          [0, 0, { translate: [0, 1.2], scale: [0.05 / 2, 0.05 / 0.5] }],
          [-1, 0],
          [-1, 1],
          [1, 1],
          [1, 0],
          [0, 0]
        )
        .setTransform({ translate: [0.2, 0], reset: 'last' }),
    j: () =>
      this.setTransform({ translate: [-0.25, 0] })
        .newCurve(
          [0, 0, { translate: [1, 1], scale: [0.7, 1], rotate: 0.05 }],
          [0, -1],
          [-1, -1],
          [-1, -0.5]
        )
        .setTransform({ rotate: -0.05 })
        .newCurve(
          [
            0,
            0,
            {
              translate: [0, 0.2],
              scale: [0.1 / 2, 0.1]
            }
          ],
          [-1, 0],
          [-1, 1],
          [1, 1],
          [1, 0],
          [0, 0]
        )
        .setWithin([0, -0.5, { reset: 'last' }], [0.5, 0.5])
        .setTransform({ translate: [0.5, 0], reset: 'last' }),
    k: () =>
      this.newCurve([0, 1], [0, 0])
        .newCurve(
          [0, 0, { translate: this.getIntersect(0.6), push: true }],
          [0.3, 0, { rotate: 0.15 }]
        )
        .newCurve([0, 0, { reset: 'pop' }], [0.3, 0, { reset: 'last' }])
        .setWithin([0, 0], [0.5, 1])
        .setTransform({ translate: [0.5, 0] }),
    l: () =>
      this.newCurve([0, 1], [0, 0.2], [0, 0], [0.1, 0]).setTransform({
        translate: [0.2, 0]
      }),
    m: () =>
      this.newCurve([0, 0, { scale: [0.5, 0.5] }], [0, 1], [1, 1], [1, 0])
        .newCurve([0, 0, { translate: [1, 0] }], [0, 1], [1, 1], [1, 0])
        .setTransform({ translate: [1, 0], reset: 'last' }),
    n: () =>
      this.newCurve(
        [0, 0, { scale: [0.5, 0.5] }],
        [0, 1],
        [1, 1],
        [1, 0]
      ).setTransform({ translate: [0.5, 0], reset: 'last' }),
    o: () =>
      this.newCurve(
        [1, 0, { translate: [0.5 / 2, 0.5 / 2], scale: 1 / 4, push: true }],
        [1, 1, { translate: [0.25, 0] }],
        [-1, 1],
        [-1, -1],
        [1, -1],
        [1, 0, { reset: 'pop' }]
      )
        .setWithin([0, 0, { reset: 'pop' }], [0.5, 0.5])
        .setTransform({ translate: [0.5, 0] }),
    p: () =>
      this.newCurve([0, 0, { translate: [0, -0.5] }], [0, 1])
        .newCurve(
          [0, 1, { translate: [0, 0.5], scale: [0.5, 0.5] }],
          [1, 1.3],
          [1, -0.3],
          [0, 0]
        )
        .setWithin([0, -0.5, { reset: 'last' }], [0.5, 0.5])
        .setTransform({ translate: [0.5, 0] }),
    q: () =>
      this.newCurve(
        [0, 1, { translate: [0, -0.5], push: true }],
        [0, 0, { strength: 1 }],
        [0.2, 0, { rotate: 0.15 }]
      )
        .newCurve(
          [0, 1, { reset: 'pop', scale: [0.5, 0.5], translate: [0, 0.5] }],
          [-1, 1.3],
          [-1, -0.3],
          [0, 0]
        )
        .setWithin([0, -0.5, { reset: 'last' }], [0.5, 0.5])
        .debug()
        .setTransform({ translate: [0.5, 0] }),
    r: () =>
      this.newCurve([0, 0], [0, 0.5])
        .newCurve(
          [0, 0, { translate: this.getIntersect(0.9) }],
          [0.25, 0.1],
          [0.5, 0]
        )
        .setTransform({ translate: [0.5, 0], reset: 'last' }),
    s: () =>
      this.newCurve(
        [
          0,
          0,
          {
            remap: [
              [0.2, 0.5],
              [0.2, 0]
            ],
            push: true,
            strength: 1
          }
        ],
        [0, 1, { scale: [0.4, -0.4] }],
        [1, 1],
        [0, 0, { reset: 'pop', translate: [0.4, 0], scale: [0.6, 0.6] }],
        [0, 1],
        [1, 1],
        [1, 0]
      )
        // .within([0, 0, { reset: 'last' }], [0.5, 1])
        .setTransform({ translate: [0.6, 0], reset: 'last' }),
    t: () =>
      this.newCurve([0, 0], [0, 1])
        .newCurve([0, 0, { translate: [0, 0.65], scale: [0.4, 1] }], [1, 0])
        .setSlide(0.5)
        .setTransform({ translate: [0.2, 0], reset: 'last' }),
    u: () =>
      this.newCurve(
        [0, 0, { translate: [0, 0.5], scale: [0.5, 0.5] }],
        [0, -1],
        [1, -1],
        [1, 0]
      ).setTransform({ translate: [0.5, 0], reset: 'last' }),
    v: () =>
      this.newCurve(
        [0, 0, { translate: [0, 0.5], scale: [0.5, 0.5] }],
        [0.5, -1, { strength: 1 }],
        [1, 0]
      ).setTransform({ translate: [0.5, 0], reset: 'last' }),
    w: () =>
      this.newCurve(
        [0, 0, { translate: [0, 0.5], scale: [0.4, 0.7] }],
        [0.5, -1, { strength: 1 }],
        [0, 0, { translate: [1, 0], strength: 1 }],
        [0.5, -1, { strength: 1 }],
        [1, 0]
      ).setTransform({ translate: [0.8, 0], reset: 'last' }),
    x: () =>
      this.newCurve([1, 1, { translate: [0.25, 0.25], scale: 0.25 }], [-1, -1])
        .newCurve([-1, 1], [1, -1])
        .setTransform({ translate: [0.5, 0], reset: 'last' }),
    y: () =>
      this.newCurve([0, -1, { scale: [0.5, 0.5] }], [1, 1])
        .newCurve([0.5, 0], [0, 1])
        .setTransform({ translate: [0.5, 0], reset: 'last' }),
    z: () =>
      this.newCurve(
        [0, 1, { scale: 0.5 }],
        [1, 1, { strength: 1 }],
        [0, 0, { strength: 1 }],
        [1, 0]
      ).setTransform({ translate: [0.5, 0], reset: 'last' })
  }

  getRandomAlong(...curve: Coordinate[]) {
    const curvePoints = curve.map(x => this.toPoint(x))
    const curvePath = this.makeCurvePath(curvePoints)
    return new PointBuilder([0, 0]).copy(curvePath.getPointAt(Math.random()))
  }

  getRandomWithin(origin: number, variation: number): number
  getRandomWithin(origin: Coordinate, variation: Coordinate): PointBuilder
  getRandomWithin(
    origin: number | Coordinate,
    variation: number | Coordinate
  ): number | PointBuilder {
    if (typeof origin === 'number' && typeof variation === 'number') {
      return origin + (Math.random() - 0.5) * 2 * variation
    } else {
      return this.toPoint(origin as Coordinate).add(
        new Vector2()
          .random()
          .subScalar(0.5)
          .multiplyScalar(2)
          .multiply(this.toPoint(variation as Coordinate))
      )
    }
  }

  newIntersect(
    line: [Coordinate | PointBuilder, Coordinate | PointBuilder],
    { curve = -1, group = -1, accuracy = 0.05 } = {}
  ) {
    if (group < 0) group += this.keyframe.groups.length
    if (curve < 0) curve += this.keyframe.groups[group].curves.length

    const path = this.makeCurvePath(
      this.keyframe.groups[group].curves[curve].map(x =>
        this.applyTransformData(
          x.clone(),
          this.keyframe.groups[group].transform
        )
      )
    )

    const linePath = [this.toPoint(line[0]), this.toPoint(line[1])].sort(
      x => x.x
    )
    v1.subVectors(linePath[1], linePath[0])
    let slope = v1.y / v1.x
    let reverseSlope = Math.abs(slope) > 10
    let intersect = linePath[0].y - linePath[0].x * slope
    if (reverseSlope) {
      slope = v1.x / v1.y
      intersect = linePath[0].x - linePath[0].y * slope
    }

    const spacedPoints = path.getSpacedPoints(path.getLength() / accuracy)
    let intersects: Vector2[] = []
    for (let point of spacedPoints) {
      if (
        reverseSlope &&
        Math.abs(point.x - (point.y * slope + intersect)) < accuracy * 2
      ) {
        intersects.push(point)
      } else if (
        Math.abs(point.y - (point.x * slope + intersect)) <
        accuracy * 2
      ) {
        intersects.push(point)
      }
    }
    const fullIntersects = sortBy(intersects, v => v.distanceTo(linePath[0]))
    if (!fullIntersects[0]) {
      return new PointBuilder().copy(linePath[1])
    }
    return new PointBuilder().copy(fullIntersects[0])
  }

  eval(func: (g: this, progress: number) => void, runCount = 1) {
    for (let i = 0; i < runCount; i++) {
      func(this, i)
    }

    return this
  }

  parse(value: string) {
    // type FunctionCall = { name: string; args: any[]; argString: string }

    let parsed = value
    const matchString = (match: RegExp, string: string) => {
      const find = string.match(match)?.[1] ?? ''
      return find
    }

    const detectRange = <T extends number | Coordinate>(
      range: string,
      callback: (string: string) => T
    ): T => {
      if (range.includes('~')) {
        const p = range.split('~')
        let r = p.map(c => callback(c))
        if (r[0] instanceof Array) {
          invariant(r instanceof Array)
          const points = r.map(x => this.toPoint(x as Coordinate))
          if (points.length === 2) {
            return new Vector2()
              .lerpVectors(points[0], points[1], Math.random())
              .toArray() as T
          } else {
            return this.makeCurvePath(points)
              .getPoint(Math.random())
              .toArray() as T
          }
        } else if (typeof r[0] === 'number') {
          if (r.length === 2) {
            return lerp(r[0], r[1] as number, Math.random()) as T
          } else {
            return this.makeCurvePath(
              r.map(x => this.toPoint([x as number, 0]))
            ).getPoint(Math.random()).x as T
          }
        }
      }
      return callback(range)
    }

    const parseCoordinate = (
      c: string,
      defaultArg: 'same' | number = 'same'
    ): Coordinate | undefined => {
      if (!c) return undefined
      return detectRange(c, c => {
        if (!c.includes(',')) {
          return [
            parseNumber(c)!,
            defaultArg === 'same' ? parseNumber(c)! : defaultArg
          ] as [number, number]
        } else {
          // if (c[2]) {
          //   const translate = parseCoordinate(
          //     matchString(/\+([\-\d\.,\/~]+)/, c[2])
          //   )
          //   const scale = parseCoordinate(
          //     matchString(/\*([\-\d\.,\/~]+)/, c[2])
          //   )
          //   const rotate = parseNumber(matchString(/@([\-\d\.\/~]+)/, c[2]))
          // }
          return c.split(',', 2).map(x => parseNumber(x)) as [number, number]
        }
      })
    }

    const parseNumber = (coordinate: string): number | undefined => {
      if (!coordinate) return undefined
      return detectRange(coordinate, c => {
        if (c.includes('/')) {
          const split = c.split('/')
          return Number(split[0]) / Number(split[1])
        }
        return Number(c)
      })
    }

    const parseArgs = (name: string, argString: string) => {
      const args = argString.split(' ')
    }

    const parseCoordinateList = (
      argString: string,
      defaultArg: 'same' | number = 'same'
    ) =>
      !argString
        ? undefined
        : argString.split(' ').map(x => parseCoordinate(x, defaultArg)!)

    const text = matchString(/(.*?)( [\+\-*@]|$|\{)/, parsed)
    parsed = parsed.replace(text, '')
    this.newText(text)

    const translate = parseCoordinate(
      matchString(/ \+([\-\d\.,\/~]+)/, parsed)
    ) as [number, number]
    const scale = parseCoordinate(
      matchString(/ \*([\-\d\.,\/~]+)/, parsed)
    ) as [number, number]
    const rotate = parseNumber(matchString(/ @([\-\d\.\/~]+)/, parsed))
    const thickness = parseNumber(
      matchString(/ (?:t|thickness):([\-\d\.\/~]+)/, parsed)
    )

    this.setWarp({ translate, scale, rotate, thickness }, { groups: -1 })

    const groupTranslate = parseCoordinateList(
      matchString(/ \+\[([\-\d\.\/ ]+)\]/, parsed)
    )
    const groupScale = parseCoordinateList(
      matchString(/ \*\[([\-\d\.\/ ]+)\]/, parsed)
    )
    const groupRotate = parseCoordinateList(
      matchString(/ @\[([\-\d\.\/ ]+)\]/, parsed),
      0
    )

    if (groupTranslate || groupScale || groupRotate) {
      const translationPath = groupTranslate
        ? this.makeCurvePath(groupTranslate.map(x => this.toPoint(x)))
        : undefined
      const rotationPath = groupRotate
        ? this.makeCurvePath(
            groupRotate.map(x => new PointBuilder([this.toRad(x[0]), 0]))
          )
        : undefined
      const scalePath = groupScale
        ? this.makeCurvePath(groupScale.map(x => this.toPoint(x)))
        : undefined
      this.eachGroup(
        (g, self, { groupProgress }) => {
          self.combineTransforms(g.transform, {
            translate: new PointBuilder().copy(
              translationPath?.getPoint(groupProgress) ?? new Vector2(0, 0)
            ),
            scale: new PointBuilder().copy(
              scalePath?.getPoint(groupProgress) ?? new Vector2(1, 1)
            ),
            rotate: rotationPath?.getPoint(groupProgress).x ?? 0
          })
        },
        { groups: [0, -1], frames: -1 }
      )
    }

    const functionMatch = /\\(\w+) ([^\\]*?)/
    let thisCall = parsed.match(functionMatch)
    while (thisCall) {
      // TODO: create a function to parse arguments
      let name = thisCall[1]
      let args = thisCall[2]
      // if (!parseArgs[name]) throw new Error(`Unknown function ${name}`)
      parsed = parsed.replace(functionMatch, '')
      thisCall = parsed.match(functionMatch)
    }

    return this
  }

  constructor(
    initialize: (builder: Builder) => Builder,
    settings: Builder['settings'] = {}
  ) {
    this.initialize = initialize
    this.settings = settings
    this.target({ frames: 0, groups: 0 })
    this.keyframe = this.defaultKeyframe()
    this.initialize(this)
  }
}

export class Built extends Builder {
  data: ReturnType<typeof this.packToTexture>

  packToTexture() {
    const defaults: Required<Jitter> = {
      hsl: [1, 1, 1],
      a: 1,
      position: [0, 0],
      size: [1, 1],
      rotation: 0
    }

    this.reset(true)
    const controlPointCounts: number[] = []
    const groups: { transform: TransformData }[] = []

    const maxControlPoints = max(
      this.keyframe.groups
        .flatMap(x => x.curves.flatMap(x => x.length))
        .concat([3])
    )!
    this.keyframe.groups.forEach((group, groupIndex) => {
      groups.push({ transform: this.keyframe.groups[groupIndex].transform })
      group.curves.forEach((curve, curveIndex) => {
        this.interpolateCurve(curve, maxControlPoints)
        controlPointCounts.push(curve.length)
      })
    })

    const createTexture = (array: Float32Array, format: AnyPixelFormat) => {
      const tex = new DataTexture(
        array,
        maxControlPoints,
        controlPointCounts.length
      )
      tex.format = format
      tex.type = FloatType
      tex.minFilter = tex.magFilter = NearestFilter
      tex.wrapS = tex.wrapT = RepeatWrapping
      tex.needsUpdate = true
      return tex
    }

    const keyframesTex = createTexture(
      new Float32Array(
        this.keyframe.groups.flatMap(x =>
          x.curves.flatMap(c =>
            range(maxControlPoints).flatMap(i => {
              return c[i] ? [c[i].x, c[i].y, c[i].strength, 1] : [0, 0, 0, 0]
            })
          )
        )
      ),
      RGBAFormat
    )

    const colorTex = createTexture(
      new Float32Array(
        this.keyframe.groups.flatMap(group =>
          group.curves.flatMap(c =>
            range(maxControlPoints).flatMap(i => {
              const point = c[i]
              return point
                ? [
                    ...(point.color ??
                      group.settings.color ??
                      this.keyframe.settings.color ??
                      defaults.hsl),
                    point.alpha ?? defaults.a!
                  ]
                : [0, 0, 0, 0]
            })
          )
        )
      ),
      RGBAFormat
    )
    const thicknessTex = createTexture(
      new Float32Array(
        this.keyframe.groups.flatMap(group =>
          group.curves.flatMap(c =>
            range(maxControlPoints).flatMap(i => {
              const point = c[i]
              return point
                ? [
                    point.thickness ??
                      group.settings.thickness ??
                      this.keyframe.settings.thickness ??
                      1
                  ]
                : [0]
            })
          )
        )
      ),
      RedFormat
    )

    return {
      keyframesTex,
      colorTex,
      thicknessTex,
      controlPointCounts,
      transform: this.keyframe.transform,
      groups
    }
  }

  packToAttributes(resolution: [number, number]) {
    let curveIndex = 0
    const curveLengths = this.keyframe.groups.map(x =>
      x.curves.map(x => this.makeCurvePath(x).getLength())
    )
    const totalCurves = sum(this.keyframe.groups.map(x => x.curves.length))
    const pointProgress = curveLengths.map(group => {
      const thisPointProgress = Float32Array.from(
        group.flatMap(curveLength => {
          const pointsInCurve =
            (curveLength * resolution[0]) /
            (this.settings.spacing ??
              1 * (this.settings.defaults?.size?.[0] ?? 1))
          const r = range(pointsInCurve).flatMap(vertexI => {
            const pointProg = vertexI / (pointsInCurve - 1)
            const curveProg = curveIndex / Math.max(1, totalCurves)
            // sample from middle of pixels
            return [pointProg, curveProg]
          })
          curveIndex++
          return r
        })
      )
      return thisPointProgress
    })
    return { pointProgress }
  }

  init() {
    this.target({ groups: [0, 0], frames: [0, 0] })
    this.initialize(this)
    this.data = this.packToTexture()
  }

  reInitialize() {
    // supposed to use these keyframes
    this.keyframe = this.defaultKeyframe()
    this.init()
  }

  protected parseDict: Record<string, ParserData> = {
    text: {
      aliases: ['text', 'tx'],
      args: ['string'],
      namedArgs: { width: { type: 'number', aliases: ['w'] } }
    }
  }

  render(name: string, key: number) {
    return <Brush key={key} name={name} keyframes={this} {...this.settings} />
  }

  constructor(b: Builder) {
    // @ts-expect-error
    super(b.initialize, b.settings)

    this.initialize(this)
    this.data = this.packToTexture()
    this.reInitialize()
  }
}
