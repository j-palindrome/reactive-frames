import { Vector2 } from 'three'
import Builder from './Builder'
const vector = new Vector2()
const vector2 = new Vector2()

export class PointBuilder extends Vector2 {
  strength: number
  color?: [number, number, number]
  alpha?: number
  thickness?: number

  constructor(
    point: [number, number] = [0, 0],
    {
      strength = 0,
      color,
      alpha,
      thickness = 1
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
  }

  lerpRandom(point: Vector2) {
    const difference = point.clone().sub(this)
    this.randomize(difference)
    return this
  }

  randomize(point: Vector2) {
    this.add({
      x: point[0] * Math.random() - point[0] / 2,
      y: point[1] * Math.random() - point[1] / 2
    })
    return this
  }

  override clone() {
    return new PointBuilder([this.x, this.y]) as this
  }
}
