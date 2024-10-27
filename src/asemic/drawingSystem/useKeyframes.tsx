import { max, range } from 'lodash'
import { useMemo } from 'react'
import * as THREE from 'three'
import { Vector2 } from 'three'
import { Keyframes } from './Keyframes'
import { PointVector } from './PointVector'

const degree = 2
const targetVector = new Vector2()

export function useKeyframes(
  keyframes: Keyframes,
  {
    color = new THREE.Color(1, 1, 1),
    alpha = 1
  }: {
    color?: THREE.Color
    alpha?: number
  }
) {
  const kf = keyframes.keyframes
  const keyframeCount = kf.length
  const curveCount = kf[0].groups.flat().length

  const controlPointsCount = max(
    kf.flatMap(x => x.groups.flat()).map(x => x.length)
  )!

  const subdivisions = (controlPointsCount - degree) / (degree - 1)
  const curveLengths = useMemo(() => {
    const totalCurves = kf[0].groups.flat().length
    const curveLengths = range(totalCurves).flatMap(() => 0)

    kf.forEach(keyframe => {
      keyframe.groups.flat().forEach((curve, j) => {
        // interpolate the bezier curves which are too short
        if (curve.length < controlPointsCount) {
          let i = 0
          const oldCurve = [...curve]
          const newCurvePoints: PointVector[] = []
          const newCurve = new THREE.CurvePath<Vector2>()
          for (let i = 0; i < oldCurve.length - 2; i++) {
            newCurve.add(
              new THREE.QuadraticBezierCurve(
                oldCurve[i],
                oldCurve[i + 1],
                oldCurve[i + 2]
              )
            )
          }
          for (let i = 0; i < controlPointsCount; i++) {
            const u = i / (controlPointsCount - 1)
            newCurvePoints.push(
              new PointVector(newCurve.getPointAt(u).toArray(), curve, i)
            )
          }
          curve.splice(0, curve.length, ...newCurvePoints)
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

    return curveLengths
  }, [])

  // write keyframes to 3D data texture.
  // read them into the shaders.
  const { keyframesTex, colorTex } = useMemo(() => {
    const createTexture = (
      getPoint: (point: PointVector) => number[],
      format: THREE.AnyPixelFormat
    ) => {
      const array = new Float32Array(
        kf.flatMap(keyframe => {
          return keyframe.groups.flatMap(group =>
            group.flatMap(curve => {
              return curve.flatMap(point => {
                return getPoint(point)
              })
            })
          )
        })
      )

      const tex = new THREE.Data3DTexture(
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
      point => [...(point.color ?? color.toArray()), point.alpha ?? alpha],
      THREE.RGBAFormat
    )
    return { keyframesTex, colorTex }
  }, [kf])

  return {
    curveLengths,
    keyframesTex,
    colorTex,
    controlPointsCount,
    keyframeCount
  }
}
