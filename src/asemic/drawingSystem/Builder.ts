import {
  AnyPixelFormat,
  Curve,
  CurvePath,
  Data3DTexture,
  FloatType,
  LineCurve,
  Matrix3,
  NearestFilter,
  QuadraticBezierCurve,
  RedFormat,
  RepeatWrapping,
  RGBAFormat,
  Vector2,
  Vector3
} from 'three'
import { PointBuilder } from './PointBuilder'
import { cloneDeep, last, max, min, range } from 'lodash'
import { lerp } from '@/util/src/math'
import { multiBezierProgressJS } from '@/util/src/shaders/bezier'
import { Jitter } from '../Brush'
import invariant from 'tiny-invariant'

const v1 = new Vector2(),
  v2 = new Vector2(),
  v3 = new Vector2()

type TargetInfo = [number, number] | number
export default class Builder {
  protected transform: Matrix3 = new Matrix3()
  protected transforms: Matrix3[] = []
  keyframes: {
    groups: GroupData[]
    transform: TransformData
  }[] = [{ groups: [], transform: {} }]
  targetGroups: [number, number] = [0, 0]
  targetFrames: [number, number] = [0, 0]
  initialized = false

  reset(clear = false) {
    this.transform.identity()
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
    console.log(this.keyframes[frame].groups[group].curves[curve])

    const curvePath = this.makeCurvePath(
      this.keyframes[frame].groups[group].curves[curve]
    )
    return this.fromPoint(curvePath.getPointAt(progress))
  }

  fromPoint(point: Vector2) {
    return point.clone().applyMatrix3(this.transform.clone().invert()).toArray()
  }

  toTransform(transform: CoordinateData) {
    const matrix = new Matrix3()

    if (transform.origin) {
      matrix.translate(transform.origin[0] * -1, transform.origin[1] * -1)
    }
    if (transform.scale) {
      if (transform.scale instanceof Array) matrix.scale(...transform.scale)
      else matrix.scale(transform.scale, transform.scale)
    }
    if (transform.rotate) matrix.rotate(-this.toRad(transform.rotate))
    if (transform.origin) {
      matrix.translate(...transform.origin)
    }
    if (transform.translate) {
      matrix.translate(transform.translate[0], transform.translate[1])
    }

    if (transform.remap) {
      const remap = new Matrix3()
      v1.set(...transform.remap[0])
      v2.set(...transform.remap[1])

      const scale = v1.distanceTo(v2)
      // console.log(v2.clone().sub(v1).angle() / Math.PI / 2)
      remap.rotate(-v2.clone().sub(v1).angle())
      if (remap[2] === 'y') {
        remap.rotate(this.toRad(0.25))
      }
      remap.scale(scale, scale)
      remap.translate(transform.remap[0][0], transform.remap[0][1])

      return remap.multiply(matrix)
    } else {
      return matrix
    }
  }

  toPoints(...coordinates: Coordinate[]) {
    return coordinates.map(x => this.toPoint(x))
  }
  toPoint(coordinate: Coordinate) {
    if (coordinate[2]) {
      this.applyTransform(coordinate[2])
    }

    return new PointBuilder(
      [coordinate[0], coordinate[1]],
      this,
      coordinate[2]
    ).applyMatrix3(this.transform)
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

    this.groups(
      g =>
        (g.transform = {
          ...g.transform,
          ...warp
        })
    )
    return this
  }

  packToTexture(defaults: Jitter) {
    this.reset(true)
    const keyframeCount = this.keyframes.length
    const curveCounts = this.keyframes[0].groups.flatMap(x => x.curves).length

    const controlPointsCount = max(
      this.keyframes
        .flatMap(x => x.groups.flatMap(x => x.curves.flatMap(x => x.length)))
        .concat([3])
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

  // getGroupTransform(progress: number, groupI: number) {
  //   const { t, start } = multiBezierProgressJS(progress, this.keyframes.length)
  //   const makeBezier = <T extends keyof GroupData['transform']>(
  //     key: T,
  //     defaultOption: GroupData['transform'][T]
  //   ) => {
  //     const groups = range(3).map(
  //       i =>
  //         this.keyframes[start + i].groups[groupI].transform[key] ??
  //         defaultOption
  //     )
  //     if (groups[0] instanceof Vector2) {
  //       invariant(groups[1] instanceof Vector2 && groups[2] instanceof Vector2)
  //       return new QuadraticBezierCurve(
  //         v1.copy(groups[0]),
  //         v2.copy(groups[1] as Vector2),
  //         v3.copy(groups[2] as Vector2)
  //       ).getPointAt(t) as GroupData['transform'][T]
  //     } else if (typeof groups[0] === 'number') {
  //       return new QuadraticBezierCurve(
  //         v1.set(groups[0], 0),
  //         v2.set(groups[1] as number, 0),
  //         v3.set(groups[2] as number, 0)
  //       ).getPointAt(t).x as GroupData['transform'][T]
  //     }
  //   }

  //   const { rotate, translate, scale } = {
  //     rotate: makeBezier('rotate', 0)!,
  //     translate: makeBezier('translate', new Vector2(0, 0))!,
  //     scale: makeBezier('scale', new Vector2(1, 1))!
  //   }

  //   return { rotate, translate, scale }
  // }

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
      (g, { bounds }) => {
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
          p.applyMatrix3(transform)
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
      frame: Builder['keyframes'][number],
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
                          .map(p => p.toFixed(2))
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
      const bounds = this.getBounds(curves)

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

  newGroup() {
    if (this.initialized) {
      throw new Error("Can't create new groups after initialization.")
    }
    this.keyframes[0].groups.push({ curves: [], transform: {} })
    this.target(-1)
    return this
  }

  newCurve(...points: Coordinate[]) {
    if (this.initialized) {
      throw new Error("Can't create new curves after initialization.")
    }
    this.keyframes[0].groups[this.targetGroups[0]].curves.push([])
    this.lastCurve(c => c.push(...this.toPoints(...points)))
    return this
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
        this.applyTransform({ translate: [0.1, 0], push: true })
          .newGroup()
          .letter(letter)
      } else if (letter === '\n') {
        lineCount++
        this.applyTransform({ reset: 'last' })
        this.transforms.push(
          this.toTransform({
            translate: [0, -1.1 * lineCount]
          })
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

  applyTransform(transform: CoordinateData) {
    if (transform.reset) {
      switch (transform.reset) {
        case 'pop':
          this.transform.copy(this.transforms.pop() ?? new Matrix3())
          break
        case 'last':
          this.transform.copy(last(this.transforms) ?? new Matrix3())
          break
        case true:
          this.transform.identity()
          break
      }
      if (typeof transform.reset === 'string') {
        const xBasis = new Vector3()
        const yBasis = new Vector3()
        this.transform.extractBasis(xBasis, yBasis, new Vector3())

        if (transform.reset.includes('rotate')) {
          this.transform.rotate(new Vector3(1, 0, 0).angleTo(xBasis))
        }
        if (transform.reset.includes('scale')) {
          this.transform.scale(1 / xBasis.length(), 1 / yBasis.length())
        }
        if (transform.reset.includes('translate')) {
          this.transform.translate(
            ...v1
              .set(0, 0)
              .applyMatrix3(this.transform)
              .multiplyScalar(-1)
              .toArray()
          )
        }
      }
    }
    this.transform.multiply(this.toTransform(transform))
    if (transform.push) {
      this.transforms.push(this.transform.clone())
    }
    return this
  }

  letters: Record<string, () => Builder> = {
    ' ': () => this.applyTransform({ translate: [0.5, 0], push: true }),
    '\t': () => this.applyTransform({ translate: [2, 0], push: true }),
    a: () =>
      this.newCurve(
        [0, 0, { remap: [[0.8, 0.2], [0.8, 0.8], 'x'] }],
        [-0.3, 0.5],
        [0.5, 1],
        [1.3, 0.5],
        [1, 0]
      )
        .debug()
        .newCurve([1.1, 0], [0.5, 0.1], [-0.1, 0])
        .slide(0.01)
        .within([0, 0, { reset: 'last' }], [0.5, 0.5])
        .applyTransform({ translate: [0.5, 0] }),
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
        .applyTransform({ translate: [0.5, 0] }),
    c: () =>
      this.newCurve([1, 0.9], [0.5, 1.2], [0, 0.5], [0.5, -0.2], [1, 0])
        .within([0, 0], [0.5, 0.5])
        .applyTransform({ translate: [0.5, 0], reset: 'last' }),
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
        .applyTransform({ translate: [0.5, 0] }),
    e: () =>
      this.newCurve([0, 0.5], [1, 0.5])
        .newCurve([1, 0.5], [1, 1], [0, 1], [0, 0], [0.9, 0], [1, 0.2])
        .within([0, 0, { reset: 'last' }], [0.5, 0.5])
        .applyTransform({ translate: [0.5, 0] }),
    f: () =>
      this.newCurve([0, 0], [0, 1 / 2], [0, 1], [1 / 2, 1], [1 / 2, 0.75])
        .newCurve([0, 1 / 2], [1 / 2, 1 / 2])
        .slide(1 / 4)
        .within([0, 0, { reset: 'last' }], [1 / 2, 1])
        .applyTransform({ translate: [0.35, 0] }),
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
        .applyTransform({ translate: [0.5, 0] }),
    h: () =>
      this.newCurve([0, 0], [0, 1])
        .newCurve([0, 0.6, { scale: [0.5, 0.7] }], [1, 1], [1, 0])
        .applyTransform({ translate: [0.5, 0], reset: 'last' }),
    i: () =>
      this.applyTransform({ translate: [0.2, 0] })
        .newCurve([0, 0], [0, 1, { scale: [1, 0.5] }])
        .newCurve(
          [0, 0, { translate: [0, 1.2], scale: [0.05 / 2, 0.05 / 0.5] }],
          [-1, 0],
          [-1, 1],
          [1, 1],
          [1, 0],
          [0, 0]
        )
        .applyTransform({ translate: [0.2, 0], reset: 'last' }),
    j: () =>
      this.applyTransform({ translate: [-0.25, 0] })
        .newCurve(
          [0, 0, { translate: [1, 1], scale: [0.7, 1], rotate: 0.05 }],
          [0, -1],
          [-1, -1],
          [-1, -0.5]
        )
        .applyTransform({ rotate: -0.05 })
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
        .applyTransform({ translate: [0.5, 0], reset: 'last' }),
    k: () =>
      this.newCurve([0, 1], [0, 0])
        .newCurve(
          [0, 0, { translate: this.getIntersect(0.6), push: true }],
          [0.3, 0, { rotate: 0.15 }]
        )
        .newCurve([0, 0, { reset: 'pop' }], [0.3, 0, { reset: 'last' }])
        .within([0, 0], [0.5, 1])
        .applyTransform({ translate: [0.5, 0] }),
    l: () =>
      this.newCurve([0, 1], [0, 0.2], [0, 0], [0.1, 0]).applyTransform({
        translate: [0.2, 0]
      }),
    m: () =>
      this.newCurve([0, 0, { scale: [0.5, 0.5] }], [0, 1], [1, 1], [1, 0])
        .newCurve([0, 0, { translate: [1, 0] }], [0, 1], [1, 1], [1, 0])
        .applyTransform({ translate: [1, 0], reset: 'last' }),
    n: () =>
      this.newCurve(
        [0, 0, { scale: [0.5, 0.5] }],
        [0, 1],
        [1, 1],
        [1, 0]
      ).applyTransform({ translate: [0.5, 0], reset: 'last' }),
    o: () =>
      this.newCurve(
        [1, 0, { translate: [0.5 / 2, 0.5 / 2], scale: 1 / 4 }],
        [1, 1],
        [-1, 1],
        [-1, -1],
        [1, -1],
        [1, 0]
      ).applyTransform({ translate: [0.5, 0], reset: 'last' }),
    p: () =>
      this.newCurve([0, 0, { translate: [0, -0.5] }], [0, 1])
        .newCurve(
          [0, 1, { translate: [0, 0.5], scale: [1, 0.5] }],
          [1, 1.3],
          [1, -0.3],
          [0, 0]
        )
        .applyTransform({ translate: [0.5, 0], reset: 'last' }),
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
        .debug()
        .applyTransform({ translate: [0.5, 0] }),
    r: () =>
      this.newCurve([0, 0], [0, 0.5])
        .newCurve(
          [0, 0, { translate: this.getIntersect(0.9) }],
          [0.25, 0.1],
          [0.5, 0]
        )
        .applyTransform({ translate: [0.5, 0], reset: 'last' }),
    s: () =>
      this.applyTransform({ remap: [[0.2, 0.5], [0.2, 0], 'x'], push: true })
        .newCurve(
          [0, 0, { scale: [0.4, -0.4] }],
          [0, 1],
          [1, 1],
          [0, 0, { reset: 'pop', translate: [0.4, 0], scale: [0.6, 0.6] }],
          [0, 1],
          [1, 1],
          [1, 0]
        )
        // .within([0, 0, { reset: 'last' }], [0.5, 1])
        .applyTransform({ translate: [0.6, 0], reset: 'last' }),
    t: () =>
      this.newCurve([0, 0], [0, 1])
        .newCurve([0, 0, { translate: [0, 0.65], scale: [0.4, 1] }], [1, 0])
        .slide(0.5)
        .applyTransform({ translate: [0.2, 0], reset: 'last' }),
    u: () =>
      this.newCurve(
        [0, 0, { translate: [0, 0.5], scale: [0.5, 0.5] }],
        [0, -1],
        [1, -1],
        [1, 0]
      ).applyTransform({ translate: [0.5, 0], reset: 'last' }),
    v: () =>
      this.newCurve(
        [0, 0, { translate: [0, 0.5], scale: [0.5, 0.5] }],
        [0.5, -1, { strength: 1 }],
        [1, 0]
      ).applyTransform({ translate: [0.5, 0], reset: 'last' }),
    w: () =>
      this.newCurve(
        [0, 0, { translate: [0, 0.5], scale: [0.4, 0.7] }],
        [0.5, -1, { strength: 1 }],
        [0, 0, { translate: [1, 0], strength: 1 }],
        [0.5, -1, { strength: 1 }],
        [1, 0]
      ).applyTransform({ translate: [0.8, 0], reset: 'last' }),
    x: () =>
      this.newCurve([1, 1, { translate: [0.25, 0.25], scale: 0.25 }], [-1, -1])
        .newCurve([-1, 1], [1, -1])
        .applyTransform({ translate: [0.5, 0], reset: 'last' }),
    y: () =>
      this.newCurve([0, -1, { scale: [0.5, 0.5] }], [1, 1])
        .newCurve([0.5, 0], [0, 1])
        .applyTransform({ translate: [0.5, 0], reset: 'last' }),
    z: () =>
      this.newCurve(
        [0, 1, { scale: 0.5 }],
        [1, 1, { strength: 1 }],
        [0, 0, { strength: 1 }],
        [1, 0]
      ).applyTransform({ translate: [0.5, 0], reset: 'last' })
  }

  constructor(initialize: (builder: Builder) => Builder) {
    initialize(this)
    this.initialized = true
  }
}
