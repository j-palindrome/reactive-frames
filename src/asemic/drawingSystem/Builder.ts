import { PointVector } from './PointVector'
import * as THREE from 'three'

export default abstract class Builder {
  originSet?: Coordinate

  constructor() {}

  protected makeCurvePath(curve: PointVector[]) {
    const path = new THREE.CurvePath()
    for (let i = 0; i < curve.length - 2; i++) {
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
    return path
  }

  interpolateCurve(curve: PointVector[], controlPointsCount: number) {
    const newCurve = this.makeCurvePath(curve)
    const newCurvePoints: PointVector[] = []
    for (let i = 0; i < controlPointsCount; i++) {
      const u = i / (controlPointsCount - 1)
      newCurvePoints.push(
        new PointVector(
          newCurve.getPointAt(u).toArray() as [number, number],
          curve,
          i
        )
      )

      curve.splice(0, curve.length, ...newCurvePoints)
    }
  }

  eachCurve(callback: (curve: PointVector[]) => void): this {
    throw new Error('not implemented')
  }

  eachPoint(callback: (point: PointVector) => void) {
    return this.eachCurve(curve => {
      curve.forEach(point => callback(point))
    })
  }

  /**
   * Slide the curve along itself to offset its start point.
   */
  slide(amount: number) {
    this.addToLog('slide', undefined, [amount])
    return this.eachCurve(curve => {
      const path = this.makeCurvePath(curve)

      const offset = curve[0].clone().sub(path.getPointAt(amount))

      curve.forEach(point => point.add(offset))
    })
  }

  debug() {
    throw new Error('debug not implemented')
  }

  protected modeSet: 'absolute' | 'relative' | 'polar' | 'steer' = 'relative'
  protected savedMode: Builder['modeSet'] | undefined
  gridSet: Coordinate = [100, 100]
  log: {
    func: string
    coords?: (OpenCoordinate | Coordinate[])[]
    endArgs?: any[]
  }[] = []
  logEnabled = true
  protected addToLog(
    func: string,
    coords?: (OpenCoordinate | Coordinate[])[],
    endArgs?: any[]
  ) {
    if (!this.logEnabled) return
    this.log.push({ func, coords, endArgs })
  }
  grid(grid: Coordinate) {
    this.addToLog('grid', undefined, [grid])
    this.gridSet = grid
  }

  mode(mode: Builder['modeSet'], origin?: Coordinate) {
    this.addToLog('mode', undefined, [mode])
    this.modeSet = mode
    this.originSet = origin
    return this
  }
}
