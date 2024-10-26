import { Vector2 } from 'three'
import { cloneDeep, last, max, range } from 'lodash'
import { useMemo } from 'react'
import { lerp } from 'three/src/math/MathUtils.js'
import * as THREE from 'three'
import { Keyframes } from './Keyframes'

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
        const bezier2 = (t: number, p0: Vector2, p1: Vector2, p2: Vector2) => {
          const tInverse = 1 - t
          return p0
            .clone()
            .multiplyScalar(tInverse ** 2)
            .add(p1.clone().multiplyScalar(2 * tInverse * t))
            .add(p2.clone().multiplyScalar(t * t))
        }
        // interpolate the bezier curves which are too short
        if (curve.length < controlPointsCount) {
          let i = 0
          const oldCurve = [...curve]
          const newCurvePoints: CurvePoint[] = []
          const newCurve = new THREE.CurvePath<Vector2>()
          for (let i = 0; i < oldCurve.length - 2; i++) {
            newCurve.add(
              new THREE.QuadraticBezierCurve(
                oldCurve[i].position,
                oldCurve[i + 1].position,
                oldCurve[i + 2].position
              )
            )
          }
          for (let i = 0; i < controlPointsCount; i++) {
            const u = i / (controlPointsCount - 1)
            newCurvePoints.push({
              position: newCurve.getPointAt(u),
              strength: 0,
              curveProgress: 0,
              pointProgress: 0
            })
          }
          newCurvePoints.forEach((point, i) => {
            point.pointProgress = i / (curve.length - 1)
          })
          curve.splice(0, curve.length, ...newCurvePoints)
        }

        const curvePath = new THREE.CurvePath()
        const segments: THREE.Curve<Vector2>[] = []
        range(subdivisions).forEach(i => {
          const thisCurve = new THREE.QuadraticBezierCurve(
            i === 0
              ? curve[i].position
              : curve[i].position.clone().lerp(curve[i + 1].position, 0.5),
            curve[i + 1].position,
            i === subdivisions - 1
              ? curve[i + 2].position
              : curve[i + 1].position.clone().lerp(curve[i + 2].position, 0.5)
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
      getPoint: (point: CurvePoint) => number[],
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
      return [...point.position.toArray(), point.strength, 1]
    }, THREE.RGBAFormat)

    const colorTex = createTexture(
      point => [
        ...(point.color?.toArray() ?? color.toArray()),
        point.alpha ?? alpha
      ],
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
