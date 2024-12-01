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
import { cloneDeep, last, max, min, range, sum } from 'lodash'
import { lerp, scale } from '@/util/src/math'
import { multiBezierProgressJS } from '@/util/src/shaders/bezier'
import { Jitter } from '../Brush'
import invariant from 'tiny-invariant'

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

const v1 = new Vector2(),
  v2 = new Vector2(),
  v3 = new Vector2()
const curveCache = new QuadraticBezierCurve()

type TargetInfo = [number, number] | number
export default class Builder {
  protected transformData: TransformData = this.toTransform({})
  protected transforms: TransformData[] = []
  keyframes: {
    groups: GroupData[]
    transform: TransformData
  }[] = [this.defaultKeyframe()]
  protected TargetInfo: [number, number] = [0, 0]
  protected targetFrames: [number, number] = [0, 0]
  protected initialize: (t: Builder) => Builder

  protected defaultKeyframe() {
    return { groups: [], transform: this.toTransform({}) }
  }

  reset(clear = false) {
    this.transformData = this.toTransform({})
    if (clear) this.transforms = []
  }

  protected target(groups?: TargetInfo, frames?: TargetInfo) {
    const TargetInfo = (from: number, to?: number) => {
      if (from < 0) from += this.keyframes[0].groups.length
      if (to === undefined) to = from
      else if (to < 0) to += this.keyframes[0].groups.length
      this.TargetInfo = [from, to]
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
      if (typeof groups === 'number') TargetInfo(groups)
      else TargetInfo(groups[0], groups[1])
    }
    if (typeof frames !== 'undefined') {
      if (typeof frames === 'number') targetFrames(frames)
      else targetFrames(frames[0], frames[1])
    }
  }

  getPoint(
    index: number = -1,
    curve: number = -1,
    group: number = -1,
    frame: number = -1
  ) {
    if (frame < 0) frame += this.keyframes.length
    if (group < 0) group += this.keyframes[frame].groups.length
    if (curve < 0) curve += this.keyframes[frame].groups[group].curves.length

    if (index < 0)
      index += this.keyframes[frame].groups[group].curves[curve].length
    return this.fromPoint(
      this.keyframes[frame].groups[group].curves[curve][index]
    )
  }

  getIntersect(
    progress: number,
    curve: number = -1,
    group: number = -1,
    frame: number = -1
  ) {
    if (frame < 0) frame += this.keyframes.length
    if (group < 0) group += this.keyframes[frame].groups.length
    if (curve < 0) curve += this.keyframes[frame].groups[group].curves.length
    if (progress < 0) progress += 1

    const curvePath = this.makeCurvePath(
      this.keyframes[frame].groups[group].curves[curve]
    )
    return this.fromPoint(curvePath.getPointAt(progress))
  }

  fromPoint(point: Vector2) {
    return this.applyTransform(point, this.transformData, true).toArray()
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
      transformData.translate.add(
        transform.translate instanceof PointBuilder
          ? transform.translate
          : new PointBuilder(transform.translate)
      )
    }
    if (transform.scale) {
      if (typeof transform.scale === 'number') {
        transformData.scale.multiplyScalar(transform.scale)
      } else {
        transformData.scale.multiply(
          transform.scale instanceof PointBuilder
            ? transform.scale
            : new PointBuilder(transform.scale)
        )
      }
    }
    if (transform.rotate !== undefined) {
      transformData.rotate += this.toRad(transform.rotate)
    }
    return transformData
  }

  toPoints(...coordinates: Coordinate[]) {
    return coordinates.map(x => this.toPoint(x))
  }

  getLastPoint(index: number = -1, curve: number = -1, group: number = -1) {
    if (group < 0) group += this.keyframes[0].groups.length
    if (curve < 0) curve += this.keyframes[0].groups[group].curves.length

    if (index < 0) {
      index += this.keyframes[0].groups[group].curves[curve].length
    }

    return this.keyframes[0].groups[group].curves[curve][index]
  }

  toPoint(coordinate: Coordinate | PointBuilder) {
    if (coordinate instanceof PointBuilder) return coordinate
    if (coordinate[2]) {
      this.transform(coordinate[2])
    }

    return this.applyTransform(
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
    transformData.translate.add(
      nextTransformData.translate
      // .multiply(transformData.scale)
      // .rotateAround({ x: 0, y: 0 }, transformData.rotate)
    )
    transformData.rotate += nextTransformData.rotate
    transformData.scale.multiply(nextTransformData.scale)
    return transformData
  }

  applyTransform<T extends Vector2>(
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

  to(warp: CoordinateData, keyframe: number = -1) {
    if (keyframe < 0) keyframe += this.keyframes.length
    this.keyframes.push(cloneDeep(this.keyframes[keyframe]))
    this.target(undefined, -1)

    this.frames(f => {
      this.combineTransforms(f.transform, this.toTransform(warp))
    })
    return this
  }

  packToTexture(resolution: Vector2) {
    const hypotenuse = resolution.length()
    const defaults: Required<Jitter> = {
      hsl: [1, 1, 1],
      a: 1,
      position: [0, 0],
      size: [1, 1],
      rotation: 0
    }

    this.reset(true)
    const totalCurves = sum(this.keyframes[0].groups.map(x => x.curves.length))
    const controlPointCounts: Float32Array = new Float32Array(totalCurves)
    const groups: {
      transform: TransformData
      totalCurveLength: number
      curveLengths: number[]
      curveIndexes: number[]
    }[] = []

    const maxControlPoints = max(
      this.keyframes[0].groups
        .flatMap(x => x.curves.flatMap(x => x.length))
        .concat([3])
    )!
    let i = 0
    let curveIndex = 0
    this.keyframes[0].groups.forEach((group, groupIndex) => {
      const curveLengths: number[] = []
      const curveIndexes: number[] = []
      let totalCurveLength = 0
      group.curves.forEach((curve, i) => {
        this.interpolateCurve(curve, maxControlPoints)
        const curveLength = this.makeCurvePath(curve).getLength() * hypotenuse
        totalCurveLength += curveLength
        curveLengths.push(curveLength)
        curveIndexes.push(curveIndex / totalCurves)
        controlPointCounts[i] = curve.length
        // TODO reinsert spacing
        // const pointsInCurve = (curveLength * hypotenuse) / defaults.size[0]
        // const r = range(pointsInCurve).flatMap(vertexI => {
        //   const pointProg = vertexI / (pointsInCurve - 1)
        //   const curveProg = curveIndex / totalCurves
        //   // sample from middle of pixels
        //   return [pointProg, curveProg]
        // })
        curveIndex++
      })
      groups.push({
        transform: this.keyframes[0].groups[groupIndex].transform,
        curveLengths,
        curveIndexes,
        totalCurveLength
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
        this.keyframes[0].groups.flatMap(x =>
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
        this.keyframes[0].groups.flatMap(group =>
          group.curves.flatMap(c =>
            range(maxControlPoints).flatMap(i => {
              const point = c[i]
              return point
                ? [...(point.color ?? defaults.hsl), point.alpha ?? defaults.a!]
                : [0, 0, 0, 0]
            })
          )
        )
      ),
      RGBAFormat
    )
    const thicknessTex = createTexture(
      new Float32Array(
        this.keyframes[0].groups.flatMap(group =>
          group.curves.flatMap(c =>
            range(maxControlPoints).flatMap(i => {
              const point = c[i]
              return point ? [point.thickness ?? 1] : [0]
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
      transform: this.keyframes[0].transform,
      groups,
      maxControlPoints
    }
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

  interpolateFrame(keyframe: number, amount = 0.5) {
    const interpolateKeyframe = cloneDeep(this.keyframes[keyframe])
    interpolateKeyframe.groups.forEach((group, groupI) =>
      group.curves.forEach((x, curveI) =>
        x.forEach((point, pointI) =>
          point.lerp(
            this.keyframes[keyframe + 1].groups[groupI][curveI][pointI],
            amount
          )
        )
      )
    )
    this.keyframes.splice(keyframe + 1, 0, interpolateKeyframe)
    return this
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

  getBounds(points: PointBuilder[], transform?: TransformData) {
    const flatX = points.map(x => x.x)
    const flatY = points.map(y => y.y)
    const minCoord = new Vector2(min(flatX)!, min(flatY)!)
    const maxCoord = new Vector2(max(flatX)!, max(flatY)!)
    if (transform) {
      this.applyTransform(minCoord, transform)
      this.applyTransform(maxCoord, transform)
    }
    return {
      min: minCoord,
      max: maxCoord,
      size: new Vector2().subVectors(maxCoord, minCoord),
      center: new Vector2().lerpVectors(minCoord, maxCoord, 0.5)
    }
  }

  along(points: Coordinate[]) {
    const curve = this.makeCurvePath(points.map(x => this.toPoint(x)))
    return this.groups((g, p, { groupProgress }) => {
      const curveProgress = curve.getPointAt(groupProgress)
      const { min } = this.getBounds(g.curves.flat(), g.transform)
      g.curves.flat().forEach(p => {
        p.add({ x: curveProgress.x - min[0], y: curveProgress.y - min[1] })
      })
    })
  }

  toRad(rotation: number) {
    return rotation * Math.PI * 2
  }

  fromRad(rotation: number) {
    return rotation / Math.PI / 2
  }

  randomize(
    {
      translate,
      rotate,
      scale
    }: {
      translate?: [Coordinate, Coordinate]
      rotate?: [number, number]
      scale?: [Coordinate, Coordinate]
    },
    groups: TargetInfo = [0, -1],
    frames?: TargetInfo
  ) {
    this.groups(
      (g, p, { bounds }) => {
        let translatePoint = translate
          ? this.toPoint(translate[0])
              .lerpRandom(this.toPoint(translate[1]))
              .toArray()
          : undefined
        let rotatePoint = rotate
          ? lerp(this.toRad(rotate[0]), this.toRad(rotate[1]), Math.random())
          : undefined
        let scalePoint = scale
          ? this.toPoint(scale[0]).lerpRandom(this.toPoint(scale[1])).toArray()
          : undefined
        const transform = this.toTransform({
          translate: translatePoint,
          scale: scalePoint,
          rotate: rotatePoint
        })
        g.curves.flat().forEach(p => {
          this.applyTransform(p, transform)
        })
      },
      groups,
      frames
    )
    return this
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

  points(
    callback: (
      point: PointBuilder,
      p: this,
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
      (curve, p, { keyframeProgress, groupProgress, curveProgress }) => {
        curve.forEach((point, i) =>
          callback(point, p, {
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
      p: this,
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
    return this.groups((group, p, { keyframeProgress, groupProgress }) => {
      group.curves.forEach((curve, i) =>
        callback(curve, p, {
          keyframeProgress,
          groupProgress,
          curveProgress: i / group.curves.length,
          bounds: this.getBounds(group.curves.flat())
        })
      )
    })
  }

  groups(
    callback: (
      group: GroupData,
      parent: this,
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
    const groupCount = this.keyframes[0].groups.length

    return this.frames((frame, p, { keyframeProgress }) => {
      for (let i = this.TargetInfo[0]; i <= this.TargetInfo[1]; i++) {
        callback(frame.groups[i], p, {
          groupProgress: i / groupCount,
          keyframeProgress,
          bounds: this.getBounds(frame.groups[i].curves.flat())
        })
      }
    })
  }

  frames(
    callback: (
      frame: Builder['keyframes'][number],
      parent: this,
      { keyframeProgress }: { keyframeProgress: number }
    ) => void,
    frames?: TargetInfo
  ) {
    this.target(undefined, frames)
    for (let i = this.targetFrames[0]; i <= this.targetFrames[1]; i++) {
      callback(this.keyframes[i], this, {
        keyframeProgress: i / this.keyframes.length
      })
    }
    return this
  }

  debug() {
    console.log(
      this.keyframes
        .slice(this.targetFrames[0], this.targetFrames[1] + 1)
        .map(x =>
          x.groups
            .slice(this.TargetInfo[0], this.TargetInfo[1] + 1)
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
      const bounds = this.getBounds(curves)
      curves.forEach(p => {
        p.sub(bounds.min).divide(bounds.size).multiply(size).add(fromV)
      })
    })

    return this
  }

  protected lastCurve(callback: (curve: PointBuilder[]) => void) {
    return this.groups(group => {
      callback(group.curves[group.curves.length - 1])
    })
  }

  /**
   * Slide the curve along itself to offset its start point.
   */
  slide(amount: number) {
    const amt = amount < 0 ? 1 + amount : amount
    return this.lastCurve(curve => {
      const path = this.makeCurvePath(curve)
      // const totalLength = path.getLength()
      const offset = curve[0].clone().sub(path.getPointAt(amount))
      curve.forEach(point => point.add(offset))
    })
  }

  newGroup(transform?: PreTransformData) {
    if (transform) this.transform(transform)
    this.keyframes[0].groups.push({
      curves: [],
      transform: this.combineTransforms(
        cloneDeep(last(this.keyframes[0].groups)?.transform) ??
          this.toTransform({}),
        this.transformData
      )
    })

    this.reset(true)
    this.target(-1)
    return this
  }

  newCurve(...points: Coordinate[]) {
    this.keyframes[0].groups[this.TargetInfo[0]].curves.push([])
    this.lastCurve(c => c.push(...this.toPoints(...points)))
    return this
  }

  newPoints(...points: Coordinate[]) {
    return this.lastCurve(c => c.push(...this.toPoints(...points)))
  }

  length(copyCount: number) {
    return this.lastCurve(curve =>
      curve.push(...range(copyCount).map(() => curve[0].clone()))
    )
  }

  private letter(type: keyof Builder['letters']) {
    return this.letters[type]()
  }

  text(
    str: string,
    { width = 1, origin = [0, 0] }: { width?: number; origin?: Coordinate } = {}
  ) {
    let lineCount = 0
    for (let letter of str) {
      if (this.letters[letter]) {
        this.transform({ translate: [0.1, 0] })
          .newGroup()
          .letter(letter)
      } else if (letter === '\n') {
        lineCount++
        this.transform({
          translate: [0, -1.1 * lineCount]
        })
      }
    }

    const maxX = max(
      this.keyframes[0].groups.map(g => {
        return this.getBounds(g.curves.flat(), g.transform).max.x
      })
    )!
    this.reset(true)
    this.groups(
      group => {
        group.transform.translate.multiplyScalar(width / maxX)
        group.transform.scale.multiplyScalar(width / maxX)
        group.transform.translate.add(this.toPoint(origin))
      },
      [0, -1]
    )
    return this
  }

  transform(transform: CoordinateData) {
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

  newShape(type: keyof typeof SHAPES, transform?: PreTransformData) {
    if (transform) this.transform(transform)
    return this.lastCurve(c => {
      c.push(...SHAPES[type].map(x => this.toPoint(x)))
    })
  }

  letters: Record<string, () => Builder> = {
    ' ': () => this.transform({ translate: [0.5, 0], push: true }),
    '\t': () => this.transform({ translate: [2, 0], push: true }),
    a: () =>
      this.newCurve([1, 1], [0.5, 1.3], [0, 0.5], [0.5, -0.3], [1, 0])
        .newCurve([0, 1, { translate: [1, 0] }], [-0.1, 0.5], [0, -0.3])
        .slide(0.1)
        .within([0, 0, { reset: true }], [0.5, 0.6])
        .transform({ translate: [0.5, 0] }),
    b: () =>
      this.newCurve([0, 1], [0, 0])
        .newCurve(
          [0, 1, { scale: [0.5, 0.5] }],
          [0.5, 1.1],
          [1, 0.5],
          [0.5, -0.1],
          [0, 0]
        )
        .within([0, 0, { reset: 'last' }], [0.5, 1])
        .transform({ translate: [0.5, 0] }),
    c: () =>
      this.newCurve(
        [1, 0.75, { scale: [0.5, 0.5] }],
        [0.9, 1],
        [0, 1],
        [0, 0],
        [0.9, 0],
        [1, 1 - 0.75]
      )
        .within([0, 0, { reset: 'last' }], [0.5, 0.5])
        .transform({ translate: [0.5, 0], reset: 'last' }),
    d: () =>
      this.newCurve([1, 1], [1, 0])
        .newCurve(
          [0, 1, { scale: [-0.5, 0.5], translate: [1, 0] }],
          [0.5, 1.1],
          [1, 0.5],
          [0.5, -0.1],
          [0, 0]
        )
        .within([0, 0, { reset: 'last' }], [0.5, 1])
        .transform({ translate: [0.5, 0] }),
    e: () =>
      this.newCurve([0, 0.5], [1, 0.5])
        .newCurve([1, 0.5], [1, 1], [0, 1], [0, 0], [0.9, 0], [1, 0.2])
        .within([0, 0, { reset: 'last' }], [0.5, 0.5])
        .transform({ translate: [0.5, 0] }),
    f: () =>
      this.newCurve([0, 0], [0, 1 / 2], [0, 1], [1 / 2, 1], [1 / 2, 0.75])
        .newCurve([0, 1 / 2], [1 / 2, 1 / 2])
        .slide(1 / 4)
        .within([0, 0, { reset: 'last' }], [1 / 2, 1])
        .transform({ translate: [0.35, 0] }),
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
        .within([0, -0.5], [0.5, 0.5])
        .transform({ translate: [0.5, 0] }),
    h: () =>
      this.newCurve([0, 0], [0, 1])
        .newCurve([0, 0.6, { scale: [0.5, 0.7] }], [1, 1], [1, 0])
        .transform({ translate: [0.5, 0], reset: 'last' }),
    i: () =>
      this.transform({ translate: [0.2, 0] })
        .newCurve([0, 0], [0, 1, { scale: [1, 0.5] }])
        .newCurve(
          [0, 0, { reset: true, translate: [0.2, 0.52], scale: 0.05 / 0.5 }],
          [-1, 0],
          [-1, 1],
          [1, 1],
          [1, 0],
          [0, 0]
        )
        .transform({ translate: [0.2, 0], reset: 'last' }),
    j: () =>
      this.transform({ translate: [-0.25, 0] })
        .newCurve(
          [0, 0, { translate: [1, 1], scale: [0.7, 1], rotate: 0.05 }],
          [0, -1],
          [-1, -1],
          [-1, -0.5]
        )
        .transform({ rotate: -0.05 })
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
        .within([0, -0.5, { reset: 'last' }], [0.5, 0.5])
        .transform({ translate: [0.5, 0], reset: 'last' }),
    k: () =>
      this.newCurve([0, 1], [0, 0])
        .newCurve(
          [0, 0, { translate: this.getIntersect(0.6), push: true }],
          [0.3, 0, { rotate: 0.15 }]
        )
        .newCurve([0, 0, { reset: 'pop' }], [0.3, 0, { reset: 'last' }])
        .within([0, 0], [0.5, 1])
        .transform({ translate: [0.5, 0] }),
    l: () =>
      this.newCurve([0, 1], [0, 0.2], [0, 0], [0.1, 0]).transform({
        translate: [0.2, 0]
      }),
    m: () =>
      this.newCurve([0, 0, { scale: [0.5, 0.5] }], [0, 1], [1, 1], [1, 0])
        .newCurve([0, 0, { translate: [0.5, 0] }], [0, 1], [1, 1], [1, 0])
        .transform({ translate: [1, 0], reset: 'last' }),
    n: () =>
      this.newCurve(
        [0, 0, { scale: [0.5, 0.5] }],
        [0, 1],
        [1, 1],
        [1, 0]
      ).transform({ translate: [0.5, 0], reset: 'last' }),
    o: () =>
      this.newCurve()
        .newShape('circle', { scale: [0.2, 0.25], translate: [0.25, 0.25] })
        .transform({ reset: true, translate: [0.5, 0] }),
    p: () =>
      this.newCurve([0, 0, { translate: [0, -0.5] }], [0, 1])
        .newCurve(
          [0, 1, { reset: true, scale: 0.5 }],
          [1, 1.3],
          [1, -0.3],
          [0, 0]
        )
        .within([0, -0.5, { reset: 'last' }], [0.5, 0.5])
        .transform({ translate: [0.5, 0] }),
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
        .within([0, -0.5, { reset: 'last' }], [0.5, 0.5])
        .transform({ translate: [0.5, 0] }),
    r: () =>
      this.newCurve([0, 0], [0, 0.5])
        .newCurve(
          [0, 0, { translate: this.getIntersect(0.9) }],
          [0.25, 0.1],
          [0.5, 0]
        )
        .transform({ translate: [0.5, 0], reset: 'last' }),
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
            push: true
          }
        ],
        [0, 1, { scale: [0.4, -0.4] }],
        [1, 1],
        [1, 0]
      )
        .newPoints(
          [0, 1, { reset: 'last', scale: [0.6, 0.6], translate: [0, -0.2] }],
          [1, 1],
          [1, 0]
        )
        // .within([0, 0, { reset: 'last' }], [0.5, 1])
        .transform({ translate: [0.6, 0], reset: true }),
    t: () =>
      this.newCurve([0, 0], [0, 1])
        .newCurve([0, 0, { translate: [0, 0.65], scale: [0.4, 1] }], [1, 0])
        .slide(0.5)
        .transform({ translate: [0.2, 0], reset: 'last' }),
    u: () =>
      this.newCurve(
        [0, 0, { translate: [0, 0.5], scale: [0.5, 0.5] }],
        [0, -1],
        [1, -1],
        [1, 0]
      ).transform({ translate: [0.5, 0], reset: 'last' }),
    v: () =>
      this.newCurve(
        [0, 0, { translate: [0, 0.5], scale: [0.5, 0.5] }],
        [0.5, -1, { strength: 1 }],
        [1, 0]
      ).transform({ translate: [0.5, 0], reset: 'last' }),
    w: () =>
      this.newCurve(
        [0, 0, { translate: [0, 0.5], scale: [0.4, 0.7] }],
        [0.5, -1, { strength: 1 }],
        [0, 0, { translate: [0.5, 0], strength: 1 }],
        [0.5, -1, { strength: 1 }],
        [1, 0]
      ).transform({ translate: [0.8, 0], reset: 'last' }),
    x: () =>
      this.newCurve([1, 1, { translate: [0.25, 0.25], scale: 0.25 }], [-1, -1])
        .newCurve([-1, 1], [1, -1])
        .transform({ translate: [0.5, 0], reset: 'last' }),
    y: () =>
      this.newCurve([0, -1, { scale: [0.5, 0.5] }], [1, 1])
        .newCurve([0.5, 0], [0, 1])
        .transform({ translate: [0.5, 0], reset: 'last' }),
    z: () =>
      this.newCurve(
        [0, 1, { scale: 0.5 }],
        [1, 1, { strength: 1 }],
        [0, 0, { strength: 1 }],
        [1, 0]
      ).transform({ translate: [0.5, 0], reset: 'last' })
  }

  eval(func: (g: this, progress: number) => void, runCount = 1) {
    for (let i = 0; i < runCount; i++) {
      func(this, i)
    }

    return this
  }

  setWarp(frame: PreTransformData & CoordinateSettings, target?: TargetInfo) {
    this.target(target)
    this.combineTransforms(this.keyframes[0].transform, this.toTransform(frame))
  }

  setWarpGroups(
    groups: (PreTransformData & CoordinateSettings)[],
    target?: TargetInfo
  ) {
    this.target(target)
    const transforms = groups.map(x => this.toTransform(x))
    return this.groups((g, self, { groupProgress }) => {
      this.combineTransforms(
        g.transform,
        this.getTransformAt(transforms, groupProgress)
      )
      // g.settings = { ...g.settings, ...groups[i] }
    })
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
    this.text(text)

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

    this.setWarp({ translate, scale, rotate, thickness }, -1)

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
      this.groups(
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
        [0, -1]
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

  reInitialize() {
    this.reset(true)
    this.target([0, 0], [0, 0])
    this.keyframes = [this.defaultKeyframe()]
    this.initialize(this)
  }

  constructor(initialize: (builder: Builder) => Builder) {
    this.initialize = initialize
    this.reInitialize()
  }
}
