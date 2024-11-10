import { Vector2 } from 'three'
import Builder from './Builder'
import NewBuilder from './NewBuilder'
const vector = new Vector2()
const vector2 = new Vector2()

export class PointBuilder extends Vector2 {
  strength: number
  color?: [number, number, number]
  alpha?: number
  thickness?: number
  parent: NewBuilder

  constructor(
    point: [number, number],
    parent: NewBuilder,
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
    return new PointBuilder([this.x, this.y], this.parent) as this
  }
}
