import { cloneDeep, max, range, sumBy } from 'lodash'
import { Data3DTexture, Vector2 } from 'three'
import GroupBuilder from './GroupBuilder'
import { PointBuilder } from './PointBuilder'
import * as THREE from 'three'
import Builder from './Builder'
import { Jitter } from '../Brush'

const vector = new Vector2()
const vector2 = new Vector2()
const vector3 = new Vector2()
export class KeyframeBuilder extends Builder {
  curveCounts: number[]

  constructor(generate: (g: GroupBuilder) => GroupBuilder) {
    super()
    const startCurves = generate(new GroupBuilder())
    this.framesSet = startCurves.framesSet
    // pass the points and point to the new parent
    for (let frame of this.framesSet) {
      for (let point of frame.groups.map(x => x.curves.flat()).flat()) {
        point.parent = this
      }
    }
    this.targetGroupsSet = [0, this.framesSet[0].groups.length - 1]
    this.targetFramesSet = [0, 0]
    this.curveCounts = this.framesSet[0].groups.map(x => x.curves.length)
  }

  to(warp: CoordinateData, keyframe: number = -1) {
    if (keyframe < 0) keyframe += this.framesSet.length
    this.framesSet.push(cloneDeep(this.framesSet[keyframe]))
    this.target(undefined, -1)
    this.points(p => p.warp(warp))
    return this
  }

  interpolate(keyframe: number, amount = 0.5) {
    const interpKeyframe = cloneDeep(this.framesSet[keyframe])
    interpKeyframe.groups.forEach((group, groupI) =>
      group.curves.forEach((x, curveI) =>
        x.forEach((point, pointI) =>
          point.lerp(
            this.framesSet[keyframe + 1].groups[groupI][curveI][pointI],
            amount
          )
        )
      )
    )
    this.framesSet.splice(keyframe + 1, 0, interpKeyframe)
    return this
  }

  packToTexture(defaults: Jitter) {
    const keyframeCount = this.framesSet.length
    const curveCounts = this.framesSet[0].groups.flatMap(x => x.curves).length

    const controlPointsCount = max(
      this.framesSet.flatMap(x =>
        x.groups.flatMap(x => x.curves.flatMap(x => x.length))
      )
    )!

    const subdivisions = controlPointsCount - 2

    const curveLengths = range(this.framesSet[0].groups.length).map(i =>
      range(this.framesSet[0].groups[i].curves.length).map(() => 0)
    )
    this.frames(
      keyframe => {
        keyframe.groups.forEach((group, groupIndex) => {
          group.curves.forEach((curve, curveIndex) => {
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
            if (length > curveLengths[groupIndex][curveIndex])
              curveLengths[groupIndex][curveIndex] = length
          })
        })
      },
      [0, -1]
    )

    const createTexture = (
      getPoint: (point: PointBuilder, group: GroupData) => number[],
      format: THREE.AnyPixelFormat
    ) => {
      const array = new Float32Array(
        this.framesSet.flatMap(keyframe => {
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
        ...(point.color ?? defaults.hsl!.map(x => x / this.gridSet[0])),
        point.alpha ?? defaults.a! / this.gridSet[0]
      ],
      THREE.RGBAFormat
    )

    const thicknessTex = createTexture(
      point => [point.thickness ?? 1],
      THREE.RedFormat
    )

    return {
      keyframesTex,
      colorTex,
      thicknessTex,
      curveLengths,
      controlPointsCount,
      keyframeCount
    }
  }

  targetFrames(from: number, to?: number) {
    if (from < 0) from += this.framesSet.length
    if (!to) to = from
    else if (to < 0) to += this.framesSet.length
    this.targetFramesSet = [from, to]
  }
}
