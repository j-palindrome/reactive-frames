import { cloneDeep, max, range, sumBy } from 'lodash'
import { Data3DTexture, Vector2 } from 'three'
import GroupBuilder from './GroupBuilder'
import { PointVector } from './PointVector'
import * as THREE from 'three'
import Builder from './Builder'

const vector = new Vector2()
const vector2 = new Vector2()
const vector3 = new Vector2()
export class Keyframes extends Builder {
  keyframes: KeyframeData[]
  private targetFrames: [number, number]
  private targetGroups: [number, number]
  curveCounts: number[]
  defaults = {
    color: [1, 1, 1],
    alpha: 1
  }

  constructor(generate: ((g: GroupBuilder) => GroupBuilder)[]) {
    super()
    const startCurves = generate.map(generate => generate(new GroupBuilder()))
    this.keyframes = [{ groups: startCurves.map(x => x.curves) }]
    this.targetGroups = [0, this.keyframes[0].groups.length - 1]
    this.targetFrames = [0, 0]
    this.curveCounts = this.keyframes[0].groups.map(x => x.length)
  }

  debug() {
    console.log(
      cloneDeep(this.keyframes)
        .slice(this.targetFrames[0], this.targetFrames[1] + 1)
        .map(x =>
          x.groups
            .slice(this.targetGroups[0], this.targetGroups[1] + 1)
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

  copyFrame(keyframe: number, copyCount: number = 1) {
    if (keyframe < 0) keyframe += this.keyframes.length
    for (let i = 0; i < copyCount; i++) {
      this.keyframes.push(cloneDeep(this.keyframes[keyframe]))
    }
    this.targetFrames = [this.keyframes.length - 1, this.keyframes.length - 1]
    return this
  }

  interpolateFrame(keyframe: number, amount = 0.5) {
    const interpKeyframe = cloneDeep(this.keyframes[keyframe])
    interpKeyframe.groups.forEach((group, groupI) =>
      group.forEach((x, curveI) =>
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

  targetFrame(from: number, to?: number) {
    if (from < 0) from += this.keyframes.length
    if (to === undefined) to = from
    else if (to < 0) to += this.keyframes.length
    this.targetFrames = [from, to]
    return this
  }

  targetGroup(from: number, to?: number) {
    if (from < 0) from += this.curveCounts.length
    if (to === undefined) to = from
    else if (to < 0) to += this.curveCounts.length
    this.targetGroups = [from, to]
    return this
  }

  eachFrame(callback: (frame: KeyframeData) => void) {
    for (let i = this.targetFrames[0]; i <= this.targetFrames[1]; i++) {
      callback(this.keyframes[i])
    }
    return this
  }

  eachCurve(callback: (curve: PointVector[]) => void) {
    return this.eachFrame(frame => {
      for (let i = this.targetGroups[0]; i <= this.targetGroups[1]; i++) {
        for (let curve of frame.groups[i]) {
          callback(curve)
        }
      }
    })
  }

  packToTexture() {
    // if (this.keyframes.length == 2) {
    //   this.interpolateFrame(0)
    // }
    const keyframeCount = this.keyframes.length
    const curveCount = this.keyframes[0].groups.flat().length

    const controlPointsCount = max(
      this.keyframes.flatMap(x => x.groups.flat()).map(x => x.length)
    )!

    const subdivisions = controlPointsCount - 2

    const totalCurves = this.keyframes[0].groups.flat().length
    const curveLengths = range(totalCurves).flatMap(() => 0)
    const createTexture = (
      getPoint: (point: PointVector) => number[],
      format: THREE.AnyPixelFormat
    ) => {
      this.eachFrame(keyframe => {
        keyframe.groups.flat().forEach((curve, j) => {
          // interpolate the bezier curves which are too short
          if (curve.length < controlPointsCount) {
            this.interpolateCurve(curve, controlPointsCount)
          }

          const curvePath = new THREE.CurvePath()
          const segments: THREE.Curve<Vector2>[] = []
          range(subdivisions).forEach(i => {
            const thisCurve = new THREE.QuadraticBezierCurve(
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
          if (length > curveLengths[j]) curveLengths[j] = length
        })
      })

      const array = new Float32Array(
        this.keyframes.flatMap(keyframe => {
          return keyframe.groups.flatMap(group =>
            group.flatMap(curve => {
              return curve.flatMap(point => {
                return getPoint(point)
              })
            })
          )
        })
      )

      const tex = new Data3DTexture(
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
      return [...point.toArray(), point.strength, 1]
    }, THREE.RGBAFormat)

    const colorTex = createTexture(
      point => [
        ...(point.color ?? this.defaults.color),
        point.alpha ?? this.defaults.alpha
      ],
      THREE.RGBAFormat
    )
    return {
      keyframesTex,
      colorTex,
      curveLengths,
      controlPointsCount,
      keyframeCount
    }
  }
}
