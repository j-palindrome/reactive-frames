import { Vector2 } from 'three'
import Keyframes from './Keyframes'
import { max, range } from 'lodash'
import { useMemo } from 'react'
import { lerp } from 'three/src/math/MathUtils.js'
import * as THREE from 'three'

const degree = 2
const targetVector = new Vector2()

export function useKeyframes({
  keyframes,
  color = new THREE.Color(1, 1, 1),
  alpha = 1
}: {
  keyframes: Keyframes['keyframes']
  color?: THREE.Color
  alpha?: number
}) {
  const keyframeCount = keyframes.length
  const curveCount = keyframes[0].curves.length

  const controlPointsCount = max(
    keyframes.flatMap(x => x.curves).map(x => x.length)
  )!

  const subdivisions = (controlPointsCount - degree) / (degree - 1)
  const curveLengths = useMemo(() => {
    const curveLengths = range(keyframes[0].curves.length).flatMap(() => 0)

    keyframes.forEach(keyframe => {
      return keyframe.curves.map((curve, j) => {
        // interpolate the bezier curves which are too short
        if (curve.length < controlPointsCount) {
          let i = 0
          while (curve.length < controlPointsCount) {
            curve.splice(i + 1, 0, {
              position: curve[i].position
                .clone()
                .lerp(curve[i + 1].position, 0.5),
              thickness: lerp(
                curve[i].thickness ?? 1,
                curve[i + 1].thickness ?? 1,
                0.5
              ),
              alpha: lerp(curve[i].alpha ?? 1, curve[i + 1].alpha ?? 1, 0.5),
              curveProgress: j / keyframe.curves.length,
              pointProgress: i / (controlPointsCount - 1)
            })
            i += 2
            if (i >= curve.length - 2) i -= curve.length - 2
          }
        }

        const curvePath = new THREE.CurvePath()
        const segments: THREE.Curve<Vector2>[] = []
        range(subdivisions).forEach(i => {
          const thisCurve = new THREE.QuadraticBezierCurve(
            // i === 0
            //   ? curve[i].position
            //   :
            curve[i].position.clone().lerp(curve[i + 1].position, 0.5),
            curve[i + 1].position,
            // i === subdivisions - 1
            //   ? curve[i + 2].position
            //   :
            curve[i + 1].position.clone().lerp(curve[i + 2].position, 0.5)
          )
          curvePath.add(thisCurve)
          segments.push(thisCurve)
        })

        const length = curvePath.getLength()
        console.log(curvePath.getCurveLengths(), length)

        // We sample each curve according to its maximum keyframe length
        if (length > curveLengths[j]) curveLengths[j] = length
      })
    })

    return curveLengths
  }, [])

  // write keyframes to 3D data texture.
  // read them into the shaders.

  const { pointsTex, colorTex } = useMemo(() => {
    const createTexture = (
      getPoint: (point: CurvePoint) => number[],
      format: THREE.AnyPixelFormat
    ) => {
      const array = new Float32Array(
        keyframes.flatMap(keyframe => {
          return keyframe.curves.flatMap(curve => {
            return curve.flatMap(point => {
              return getPoint(point)
            })
          })
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
      tex.needsUpdate = true
      return tex
    }

    const pointsTex = createTexture(point => {
      return [...point.position.toArray(), point.thickness ?? 1, 0]
    }, THREE.RGBAFormat)

    const colorTex = createTexture(
      point => [
        ...(point.color?.toArray() ?? color.toArray()),
        point.alpha ?? alpha
      ],
      THREE.RGBAFormat
    )
    return { pointsTex, colorTex }
  }, [keyframes])

  return {
    curveLengths,
    pointsTex,
    colorTex,
    controlPointsCount,
    keyframeCount,
    type: '3d' as '3d'
  }
}
