import {
  AnyPixelFormat,
  Curve,
  CurvePath,
  Data3DTexture,
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
import { Vec } from 'pts'
import { cloneDeep, last, max, min, range } from 'lodash'
import { lerp } from '@/util/src/math'
import { multiBezierProgressJS } from '@/util/src/shaders/bezier'
import { Jitter } from '../Brush'
import invariant from 'tiny-invariant'

const v1 = new Vector2(),
  v2 = new Vector2(),
  v3 = new Vector2(),
  v4 = new Vector2()

type TargetInfo = [number, number] | number
export default class NewBuilder {
  protected transform: Required<TransformData> = {
    origin: new Vector2(0, 0),
    scale: new Vector2(1, 1),
    translate: new Vector2(0, 0),
    rotate: 0
  }
  protected transforms: TransformData[] = []
  keyframes: {
    groups: GroupData[]
    transform: TransformData
  }[] = [{ groups: [], transform: {} }]
  targetGroups: [number, number] = [0, 0]
  targetFrames: [number, number] = [0, 0]
  initialized = false

  reset(clear = false) {
    this.transform.origin.set(1, 1)
    this.transform.rotate = 0
    this.transform.scale.set(0, 0)
    if (clear) this.transforms = []
  }

  protected target(groups?: TargetInfo, frames?: TargetInfo) {
    const targetGroups = (from: number, to?: number) => {
      if (from < 0) from += this.keyframes[0].groups.length
      if (to === undefined) to = from
      else if (to < 0) to += this.keyframes[0].groups.length
      this.targetGroups = [from, to]
      return this
    }
    const targetFrames = (from: number, to?: number) => {
      if (from < 0) from += this.keyframes.length
      if (to === undefined) to = from
      else if (to < 0) to += this.keyframes.length
      this.targetFrames = [from, to]
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

  applyTransform<T extends v2 | PointBuilder>(
    vector: T,
    transform: TransformData
  ): T {
    if (transform.origin) v1.sub(transform.origin)
    if (transform.translate) v1.add(transform.translate)
    if (transform.scale) v1.multiply(transform.scale)
    if (transform.rotate) v1.rotateAround({ x: 0, y: 0 }, transform.rotate)
    if (transform.origin) v1.add(transform.origin) as T
    return vector
  }

  getPoint(frame: number, group: number, curve: number, index: number) {
    if (frame < 0) frame += this.keyframes.length
    if (group < 0) group += this.keyframes[frame].groups.length
    if (curve < 0) curve += this.keyframes[frame].groups[group].curves.length
    if (index < 0)
      index += this.keyframes[frame].groups[group].curves[curve].length
    return this.keyframes[frame].groups[group].curves[curve][index]
  }

  getProgress(frame: number, group: number, curve: number, progress: number) {
    if (frame < 0) frame += this.keyframes.length
    if (group < 0) group += this.keyframes[frame].groups.length
    if (curve < 0) curve += this.keyframes[frame].groups[group].curves.length
    if (progress < 0) progress += 1
    const curvePath = this.makeCurvePath(
      this.keyframes[frame].groups[group].curves[curve]
    )
    return curvePath.getPointAt(progress)
  }

  toTransform(coordinate: CoordinateData): TransformData {
    const transform: TransformData = {}
    if (coordinate.action) {
      switch (coordinate.action) {
        case 'clear':
          this.transforms = []
          break
        case 'pop':
          this.transforms.pop()
          break
        case 'push':
          this.transforms.push(cloneDeep(this.transform))
          this.reset()
          break
        case 'reset':
          this.reset()
          break
      }
    }

    if (coordinate.origin)
      transform.origin = new Vector2(coordinate.origin[0], coordinate.origin[1])
    if (coordinate.scale)
      transform.scale = new Vector2(coordinate.scale[0], coordinate.scale[1])
    if (coordinate.translate)
      transform.scale = new Vector2(
        coordinate.translate[0],
        coordinate.translate[1]
      )
    if (coordinate.rotate) transform.rotate = coordinate.rotate * Math.PI * 2
    return transform
  }

  toPoint(coordinate: Coordinate): PointBuilder {
    if (coordinate[2])
      this.transform = { ...this.transform, ...this.toTransform(coordinate[2]) }

    const point = new PointBuilder(
      [coordinate[0], coordinate[1]],
      this,
      coordinate[2]
    )
    this.transforms.forEach(t => this.applyTransform(point, t))
    return this.applyTransform(point, this.transform)
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
        new PointBuilder(
          newCurve.getPointAt(u).toArray() as [number, number],
          this
        )
      )

      curve.splice(0, curve.length, ...newCurvePoints)
    }
  }

  to(warp: CoordinateData, keyframe: number = -1) {
    if (keyframe < 0) keyframe += this.keyframes.length
    this.keyframes.push(cloneDeep(this.keyframes[keyframe]))
    this.target(undefined, -1)
    const transformData: TransformData = {
      translate: warp.translate ? this.toPoint(warp.translate) : undefined,
      rotate: warp.rotate ? this.toRad(warp.rotate) : undefined,
      scale: warp.scale ? this.toPoint(warp.scale) : undefined
    }
    this.groups(
      g =>
        (g.transform = {
          ...g.transform,
          ...transformData
        })
    )
    return this
  }

  packToTexture(defaults: Jitter) {
    this.reset(true)
    const keyframeCount = this.keyframes.length
    const curveCounts = this.keyframes[0].groups.flatMap(x => x.curves).length

    const controlPointsCount = max(
      this.keyframes.flatMap(x =>
        x.groups.flatMap(x => x.curves.flatMap(x => x.length))
      )
    )!

    const subdivisions = controlPointsCount - 2
    const curveLengths = range(this.keyframes[0].groups.length).map(i =>
      range(this.keyframes[0].groups[i].curves.length).map(() => 0)
    )
    this.frames(
      keyframe => {
        keyframe.groups.forEach((group, groupIndex) => {
          group.curves.forEach((curve, curveIndex) => {
            // interpolate the bezier curves which are too short
            if (curve.length < controlPointsCount) {
              this.interpolateCurve(curve, controlPointsCount)
            }

            const curvePath = new CurvePath()
            const segments: Curve<Vector2>[] = []
            range(subdivisions).forEach(i => {
              const thisCurve = new QuadraticBezierCurve(
                i === 0 ? curve[i] : curve[i].clone().lerp(curve[i + 1], 0.5),
                curve[i + 1],
                i === subdivisions - 1
                  ? curve[i + 2]
                  : curve[i + 1].clone().lerp(curve[i + 2], 0.5)
              )
              curvePath.add(thisCurve)
              segments.push(thisCurve)
            })

            const length = curvePath.getLength()
            // We sample each curve according to its maximum keyframe length
            if (length > curveLengths[groupIndex][curveIndex])
              curveLengths[groupIndex][curveIndex] = length
          })
        })
      },
      [0, -1]
    )

    const createTexture = (
      getPoint: (point: PointBuilder, group: GroupData) => number[],
      format: AnyPixelFormat
    ) => {
      const array = new Float32Array(
        this.keyframes.flatMap(keyframe => {
          return keyframe.groups.flatMap(group =>
            group.curves.flatMap(curve => {
              return curve.flatMap(point => {
                return getPoint(point, group)
              })
            })
          )
        })
      )

      const tex = new Data3DTexture(
        array,
        controlPointsCount,
        curveCounts,
        keyframeCount
      )
      tex.format = format
      tex.type = FloatType
      tex.minFilter = tex.magFilter = NearestFilter
      tex.wrapR = tex.wrapS = tex.wrapT = RepeatWrapping
      tex.needsUpdate = true
      return tex
    }

    const keyframesTex = createTexture(point => {
      return [...point.toArray(), point.strength, 1]
    }, RGBAFormat)

    const colorTex = createTexture(
      point => [...(point.color ?? defaults.hsl!), point.alpha ?? defaults.a!],
      RGBAFormat
    )

    const thicknessTex = createTexture(
      point => [point.thickness ?? 1],
      RedFormat
    )

    // this.groups(
    //   g => {
    //     g.transform.origin = this.toPoint(
    //       this.getBounds(g.curves.flat()).min
    //     ).divideScalar(100)
    //   },
    //   [0, -1],
    //   [0, -1]
    // )

    return {
      keyframesTex,
      colorTex,
      thicknessTex,
      curveLengths,
      controlPointsCount,
      keyframeCount
    }
  }

  getGroupTransform(progress: number, groupI: number) {
    const { t, start } = multiBezierProgressJS(progress, this.keyframes.length)
    const makeBezier = <T extends keyof GroupData['transform']>(
      key: T,
      defaultOption: GroupData['transform'][T]
    ) => {
      const groups = range(3).map(
        i =>
          this.keyframes[start + i].groups[groupI].transform[key] ??
          defaultOption
      )
      if (groups[0] instanceof Vector2) {
        invariant(groups[1] instanceof Vector2 && groups[2] instanceof Vector2)
        return new QuadraticBezierCurve(
          v1.copy(groups[0]),
          v2.copy(groups[1] as Vector2),
          v3.copy(groups[2] as Vector2)
        ).getPointAt(t) as GroupData['transform'][T]
      } else if (typeof groups[0] === 'number') {
        return new QuadraticBezierCurve(
          v1.set(groups[0], 0),
          v2.set(groups[1] as number, 0),
          v3.set(groups[2] as number, 0)
        ).getPointAt(t).x as GroupData['transform'][T]
      }
    }

    const { rotate, translate, scale, origin } = {
      rotate: makeBezier('rotate', 0)!,
      translate: makeBezier('translate', new Vector2(0, 0))!,
      scale: makeBezier('scale', new Vector2(1, 1))!,
      origin: makeBezier('origin', new Vector2(0, 0))!
    }

    return { rotate, translate, scale, origin }
  }

  interpolateFrame(keyframe: number, amount = 0.5) {
    const interpKeyframe = cloneDeep(this.keyframes[keyframe])
    interpKeyframe.groups.forEach((group, groupI) =>
      group.curves.forEach((x, curveI) =>
        x.forEach((point, pointI) =>
          point.lerp(
            this.keyframes[keyframe + 1].groups[groupI][curveI][pointI],
            amount
          )
        )
      )
    )
    this.keyframes.splice(keyframe + 1, 0, interpKeyframe)
    return this
  }

  protected makeCurvePath(curve: PointBuilder[]): CurvePath<Vector2> {
    const path = new CurvePath()
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

    // @ts-ignore
    return path
  }

  getBounds(points: PointBuilder[]) {
    const flatX = points.map(x => x.x)
    const flatY = points.map(y => y.y)
    const minCoord = new Vector2(min(flatX)!, min(flatY)!)
    const maxCoord = new Vector2(max(flatX)!, max(flatY)!)
    return {
      min: minCoord,
      max: maxCoord,
      size: new Vector2().subVectors(maxCoord, minCoord),
      center: new Vector2().lerpVectors(minCoord, maxCoord, 0.5)
    }
  }

  along(points: Coordinate[]) {
    const curve = this.makeCurvePath(points.map(x => this.toPoint(x)))
    return this.groups((g, { groupProgress }) => {
      const curveProgress = curve.getPointAt(groupProgress)
      const { min } = this.getBounds(g.curves.flat())
      g.curves.flat().forEach(p => {
        p.add({ x: curveProgress.x - min[0], y: curveProgress.y - min[1] })
      })
    })
  }

  toRad(rotation: number) {
    return rotation * Math.PI * 2
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
        let translatePoint = translate
          ? this.toPoint(translate[0]).lerpRandom(this.toPoint(translate[1]))
          : undefined
        let rotatePoint = rotate
          ? lerp(this.toRad(rotate[0]), this.toRad(rotate[1]), Math.random())
          : undefined
        let scalePoint = scale
          ? this.toPoint(scale[0]).lerpRandom(this.toPoint(scale[1]))
          : undefined
        let originPoint = origin
          ? this.toPoint(origin).add(bounds.min)
          : undefined

        g.curves.flat().forEach(p => {
          this.applyTransform(p, {
            translate: translatePoint,
            rotate: rotatePoint,
            scale: scalePoint,
            origin: originPoint
          })
        })
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
        bounds: ReturnType<NewBuilder['getBounds']>
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
        bounds: ReturnType<NewBuilder['getBounds']>
      }
    ) => void,
    groups?: [number, number] | number,
    frames?: [number, number] | number
  ) {
    this.target(groups, frames)
    const groupCount = this.keyframes[0].groups.length

    return this.frames((frame, { keyframeProgress }) => {
      for (let i = this.targetGroups[0]; i <= this.targetGroups[1]; i++) {
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
      frame: NewBuilder['keyframes'][number],
      { keyframeProgress }: { keyframeProgress: number }
    ) => void,
    frames?: TargetInfo
  ) {
    this.target(undefined, frames)
    for (let i = this.targetFrames[0]; i <= this.targetFrames[1]; i++) {
      callback(this.keyframes[i], {
        keyframeProgress: i / this.keyframes.length
      })
    }
    return this
  }

  debug() {
    console.log(
      cloneDeep(this.keyframes)
        .slice(this.targetFrames[0], this.targetFrames[1] + 1)
        .map(x =>
          x.groups
            .slice(this.targetGroups[0], this.targetGroups[1] + 1)
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
    groups?: [number, number] | number,
    frames?: [number, number] | number
  ) {
    this.target(groups, frames)
    const fromV = this.toPoint(from)
    const size = new Vector2().copy(this.toPoint(to)).sub(fromV)

    this.groups(g => {
      const curves = g.curves.flat()
      const bounds = this.getBounds(curves.flat())

      curves.flat().forEach(p => {
        p.sub(bounds.min).divide(bounds.size).multiply(size).add(fromV)
      })
    })

    return this
  }

  lastCurve(callback: (curve: PointBuilder[]) => void) {
    return this.groups(group => {
      callback(group.curves[group.curves.length - 1])
    })
  }

  /**
   * Slide the curve along itself to offset its start point.
   */
  slide(amount: number) {
    return this.lastCurve(curve => {
      const path = this.makeCurvePath(curve)

      const offset = curve[0].clone().sub(path.getPointAt(amount))

      curve.forEach(point => point.add(offset))
    })
  }

  new(origin: Coordinate, newGroup: boolean = false) {
    if (this.initialized) {
      throw new Error("Can't create new curves/groups after initialization.")
    }
    if (newGroup) {
      this.keyframes[0].groups.push({ curves: [], transform: {} })
      this.target(-1)
      this.reset()
    }
    const originV = this.toPoint(origin)
    this.keyframes[0].groups[this.targetGroups[0]].curves.push([])
    this.lastCurve(c => c.push(originV))
    return this
  }

  arc(centerPoint: Coordinate, amount: number) {
    const centerPointV = this.toPoint(centerPoint)

    return this.lastCurve(curve => {
      const lastPoint = last(curve)!
      v1.set(centerPoint[0], centerPoint[1])
      const points: Coordinate[] = []
      let progress =
        (curve.length === 1 ? 1 / 16 : 1 / 8) * (amount < 0 ? -1 : 1)
      // let progress = (1 / 8 / 2) * (amount < 0 ? -1 : 1)
      while (amount < 0 ? progress >= amount : progress <= amount) {
        points.push(
          v2
            .copy(lastPoint)
            .rotateAround(v1, progress * Math.PI * 2)
            .toArray()
        )
        progress += (1 / 8) * (amount < 0 ? -1 : 1)
      }
      progress -= (1 / 8) * (amount < 0 ? -1 : 1)
      if (amount < 0 ? progress >= amount : progress <= amount) {
        points.push(
          v2
            .copy(lastPoint)
            .rotateAround(v1, amount * Math.PI * 2)
            .toArray()
        )
      }
      curve.push()
    })
  }

  line(endPoint: Coordinate) {
    this.curve(endPoint, [0.5, 0])
    return this
  }

  /**
   * Make a curve where the middle points are scaled according to the line from startPoint to endPoint.
   */
  curve(endPoint: Coordinate, ...midPoints: Coordinate[]) {
    const endPointV = this.toPoint(endPoint)

    return this.lastCurve(curve => {
      const lastPoint = last(curve)!
      const scale = endPointV.distanceTo(lastPoint)
      const rotate = endPointV.clone().sub(lastPoint).angle()
      this.transforms.push({
        scale: new Vector2(scale, scale),
        rotate,
        origin: lastPoint
      })
      curve.push(...midPoints.map(x => this.toPoint(x)))
      curve.push(endPointV)
      this.transforms.pop()
    })
  }

  addPoints(...coords: Coordinate[]) {
    return this.lastCurve(curve => {
      this.lastCurve(c => c.push(...coords.map(x => this.toPoint(x))))
    })
  }

  length(copyCount: number) {
    return this.lastCurve(curve =>
      curve.push(...range(copyCount).map(() => curve[0].clone()))
    )
  }

  private letter(type: keyof NewBuilder['letters']) {
    return this.letters[type]()
  }

  text(
    str: string,
    { width = 1, origin = [0, 0] }: { width?: number; origin?: Coordinate } = {}
  ) {
    const originV = this.toPoint(origin)

    this.transforms.push(this.toTransform({ origin: [10, 0] }))
    let lineCount = 0
    for (let letter of str) {
      if (this.letters[letter]) {
        this.letter(letter).push({ origin: [10, 0] })
      } else if (letter === '\n') {
        lineCount++
        this.reset(true)
        this.transforms.push(
          this.toTransform({ origin: [10, -110 * lineCount] })
        )
      }
    }

    const maxX = max(
      this.keyframes[0].groups
        .flatMap(x => x.curves)
        .flat()
        .map(x => x.x)
    )
    this.groups(
      group =>
        group.curves
          .flat()
          .forEach(point =>
            point
              .multiplyScalar(width / maxX!)
              .add({ x: origin[0], y: origin[1] })
          ),
      [0, -1]
    )

    this.reset(true)

    return this
  }

  push(transform: CoordinateData) {
    this.transforms.push(this.toTransform(transform))
    return this
  }

  letters: Record<string, () => NewBuilder> = {
    ' ': () => this.push({ origin: [50, 0] }),
    '\t': () => this.push({ origin: [200, 0] }),
    a: () =>
      this.new([80, 80], true)
        .curve([20, 50], [30, -40])
        .curve([80, 20], [50, -40])
        .new([80, 80])
        .curve([80, 5], [50, -10])
        .slide(0.1)
        .within([0, 0], [50, 50])
        .push({ origin: [50, 0] }),
    b: () =>
      this.new([10, 90], true)
        .line([10, 10])
        .new([10, 50])
        .curve([50, -20, { mode: 'relative' }], [50, 20])
        .curve([10, 10, { mode: 'absolute' }], [50, 20])
        .within([0, 0], [50, 100])
        .push({ origin: [50, 0] }),
    c: () =>
      this.new([80, 70, { scale: [70, 70] }], true)
        .arc([50, 50], 0.8)
        .within([0, 0, { reset: true }], [50, 50])
        .push({ origin: [50, 0] }),
    d: () =>
      this.new([90, 90], true)
        .line([0, -70, { mode: 'relative' }])
        .new([90, 55, { mode: 'absolute' }])
        .curve([-50, -20, { mode: 'relative' }], [50, -30])
        .curve([90, 23.5, { mode: 'absolute' }], [50, -20])
        .within([0, 0], [50, 100])
        .push({ origin: [50, 0] }),
    e: () =>
      this.new([80, 50], true)
        .addPoints([80, 70])
        .arc([-30, -20, { mode: 'relative' }], 0.8)
        .new([55, -1, { mode: 'intersect' }])
        .line([80, 50, { mode: 'absolute' }])
        .within([0, 0], [50, 50])
        .push({ origin: [50, 0] }),
    f: () =>
      this.new([70, 70], true)
        .arc([-20, 0, { mode: 'relative' }], 0.5)
        .line([0, -50])
        .new([70, -1, { mode: 'intersect' }])
        .line([30, 0, { mode: 'relative' }])
        .slide(0.2)
        .within([0, 0, { mode: 'absolute' }], [50, 100])
        .push({ origin: [25, 0] }),
    g: () =>
      this.new([70, 60], true)
        .arc([20, -45, { mode: 'polar' }], 1)
        .new([0, 0])
        .addPoints(
          [100, -25],
          [
            50,
            0,
            {
              translate: [0, -100, { mode: 'absolute' }],
              mode: 'intersect'
            }
          ],
          [0, 20, { mode: 'relative' }]
        )
        .debug()
        .within([0, -50, { mode: 'absolute' }], [50, 50])
        .debug()
        .push({ origin: [50, 0] }),
    h: () =>
      this.new([10, 90], true)
        .line([0, -80, { mode: 'relative' }])
        .new([70, -1, { mode: 'intersect' }])
        .curve([50, 10, { mode: 'absolute' }], [10, 150])
        .within([0, 0], [50, 100])
        .push({ origin: [50, 0] }),
    i: () =>
      this.new([51, 70], true)
        .arc([-1, -1, { mode: 'relative' }], 1)
        .new([-1, -10])
        .line([50, 10, { mode: 'absolute' }])
        .within([0, 0], [10, 75])
        .push({ origin: [10, 0] }),
    j: () =>
      this.push({ origin: [-25, 0] })
        .new([51, 76, { translate: [0, -40], scale: [100, 120] }], true)
        .arc([-1, -1, { mode: 'relative' }], 1)
        .new([-1, -10])
        .addPoints([10, -60], [-30, 0], [0, 15])
        .within([0, -50, { mode: 'absolute' }], [50, 50])
        .push({ origin: [50, 0] }),
    k: () =>
      this.new([30, 90], true)
        .line([0, -80, { mode: 'relative' }])
        .new([
          30,
          30,
          { mode: 'absolute', translate: [50, -1, { mode: 'intersect' }] }
        ])
        .addPoints(
          [0, 0, { strength: 1, mode: 'absolute', reset: false }],
          [50, 0, { translate: [100, -2, { mode: 'intersect' }] }]
        )
        .debug()
        .within([0, 0, { reset: true }], [50, 100])
        .push({ origin: [50, 0] }),
    l: () =>
      this.new([50, 90], true)
        .addPoints([0, -70, { mode: 'relative' }])
        .curve([10, -10], [50, -50, { strength: 0.5 }])
        .within([0, 0, { mode: 'absolute' }], [25, 100])
        .push({ origin: [25, 0] }),
    m: () =>
      this.new(
        [
          0,
          0,
          {
            mode: 'absolute',
            translate: [10, 10],
            scale: [40, 40]
          }
        ],
        true
      )
        .addPoints([0, 100], [100, 100], [100, 0])
        .new([
          0,
          0,
          {
            mode: 'absolute',
            translate: [100, -1, { mode: 'intersect' }],
            scale: [40, 40]
          }
        ])
        .addPoints([0, 100], [100, 100], [100, 0])
        .within([0, 0, { reset: true }], [75, 50])
        .push({ origin: [75, 0] }),
    n: () =>
      this.new([70, 10], true)
        .addPoints(
          [
            0,
            100,
            {
              mode: 'absolute',
              translate: [70, 10],
              scale: [-40, 40]
            }
          ],
          [100, 100],
          [100, 40],
          [100, 0]
        )
        .within([0, 0, { translate: [0, 0], scale: [100, 100] }], [50, 50])
        .push({ origin: [50, 0] }),
    o: () =>
      this.new([20, 20, { mode: 'absolute', translate: [50, 50] }], true)
        .arc([0, 0], 1)
        .within([0, 0, { reset: true }], [50, 50])
        .push({ origin: [50, 0] }),
    p: () =>
      this.new([50, 80], true)
        .line([0, -70, { mode: 'relative' }])
        .new([10, -1, { mode: 'intersect' }])
        .curve([0, -30, { mode: 'relative' }], [-40, 100], [140, 100])
        .within([0, -50, { mode: 'absolute', translate: [0, 10] }], [50, 50])
        .push({ origin: [50, 0] }),
    q: () =>
      this.new([50, 80, { scale: [100, 130], translate: [0, -40] }], true)
        .line([0, -80, { mode: 'relative', strength: 1 }])
        .addPoints([30, 12, { mode: 'polar' }])
        .new([5, -1, { mode: 'intersect' }])
        .curve([0, -30, { mode: 'relative' }], [-20, -170], [120, -170])
        .within([0, -50, { mode: 'absolute' }], [50, 100, { mode: 'relative' }])
        .push({ origin: [50, 0] }),
    r: () =>
      this.new([30, 60], true)
        .line([30, 10])
        .new([20, -1, { mode: 'intersect' }])
        .curve([40, 0, { mode: 'relative' }], [50, 50])
        .within([0, 0, { mode: 'absolute' }], [50, 50])
        .push({ origin: [50, 0] }),
    s: () =>
      this.new([70, 70], true)
        .curve([50, 50], [-20, -100], [120, -100])
        .curve([30, 30], [-20, 100], [120, 100])
        .within([0, 0], [50, 50])
        .push({ origin: [50, 0] }),
    t: () =>
      this.push({ origin: [-15, 0] })
        .new([50, 100, { translate: [0, 10] }], true)
        .line([50, 0])
        .new([30, -1, { mode: 'intersect' }])
        .line([40, 0, { mode: 'relative' }])
        .slide(0.5)
        .within([0, 0, { mode: 'absolute' }], [50, 100])
        .push({ origin: [45, 0] }),
    u: () =>
      this.new([0, 100], true)
        .curve([100, 0, { mode: 'relative' }], [0, -100], [100, -100])
        .within([0, 0, { mode: 'absolute' }], [50, 50])
        .push({ origin: [50, 0] }),
    v: () =>
      this.new([0, 100, { mode: 'absolute' }], true)
        .curve([100, 0, { mode: 'relative' }], [50, -100, { strength: 1 }])
        .within([0, 0, { mode: 'absolute' }], [50, 50])
        .push({ origin: [50, 0] }),
    w: () =>
      this.new([0, 50, { scale: [80, 170], translate: [0, -25] }], true)
        .addPoints(
          [25, 0, { strength: 1 }],
          [50, 50, { strength: 1 }],
          [75, 0, { strength: 1 }],
          [100, 50, { strength: 1 }]
        )
        .within([0, 0, { reset: true }], [100, 50])
        .push({ origin: [100, 0] }),
    x: () =>
      this.new([0, 0, { scale: [50, 60], translate: [0, 0] }], true)
        .line([100, 100])
        .new([0, 100])
        .line([100, 0])
        .within([0, 0, { reset: true }], [50, 50])
        .push({ origin: [50, 0] }),
    y: () =>
      this.new([0, 0, { scale: [50, 120], translate: [0, -60] }], true)
        .line([100, 100])
        .new([0, 100])
        .line([50, 50])
        .within([0, -50, { reset: true }], [50, 50])
        .push({ origin: [50, 0] }),
    z: () =>
      this.new([0, 100, { scale: [50, 70] }], true)
        .addPoints(
          [100, 100, { strength: 1 }],
          [0, 0, { strength: 1 }],
          [100, 0, { strength: 1 }]
        )
        .within([0, 0, { reset: true }], [50, 50])
        .push({ origin: [50, 0] })
  }

  constructor(initialize: (builder: NewBuilder) => NewBuilder) {
    initialize(this)
    this.initialized = true
  }
}
