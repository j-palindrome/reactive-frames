import { Vector2 } from 'three'
import Builder from './Builder'
const vector = new Vector2()
const vector2 = new Vector2()

export class PointBuilder extends Vector2 {
  strength: number
  color?: [number, number, number]
  alpha?: number
  thickness?: number
  parent: Builder

  constructor(
    point: Coordinate = [0, 0],
    parent: Builder,
    {
      strength = 0,
      color,
      alpha,
      thickness
    }: {
      strength?: number
      color?: [number, number, number]
      alpha?: number
      thickness?: number
    } = {}
  ) {
    super(point[0], point[1])
    this.strength = strength
    this.color = color
    this.alpha = alpha
    this.thickness = thickness
    this.parent = parent
  }

  rotateFrom(from: Coordinate, amount: number) {
    from = this.parent.getRelative(from)
    this.rotateAround(vector.set(from[0], from[1]), amount * Math.PI * 2)
    return this
  }

  translateFrom(from: Coordinate, to: Coordinate, amount: number) {
    from = this.parent.applyGrid(from)
    to = this.parent.applyGrid(to)
    this.sub(vector.set(from[0], from[1]))
      .lerp(vector2.set(to[0], to[1]), amount)
      .add(vector)
    return this
  }

  scaleFrom(from: Coordinate, by: Coordinate) {
    from = this.parent.getRelative(from, { applyGrid: true })
    by = this.parent.applyGrid(by)
    this.sub(vector.set(from[0], from[1]))
      .multiply(vector2.set(by[0], by[1]))
      .add(vector)
    return this
  }

  randomize(amount: [number, number] = [1, 1]) {
    const v = vector.set(...(this.parent.applyGrid(amount) as [number, number]))
    this.add(vector.random().subScalar(0.5).multiply(v))
    return this
  }

  warp(data: CoordinateData) {
    const c = this.parent.applyGrid([this.x, this.y])
    const coord = this.parent.getRelative([c[0], c[1], data])

    this.set(coord[0], coord[1])
    return this
  }

  override clone() {
    return new PointBuilder([this.x, this.y], this.parent) as this
  }
}
