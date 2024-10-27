import { Vector2 } from 'three'
const vector = new Vector2()
const vector2 = new Vector2()

export class PointVector extends Vector2 {
  curve: PointVector[]
  index: number
  strength: number
  color?: [number, number, number]
  alpha?: number
  thickness?: number

  constructor(
    point: Coordinate = [0, 0],
    curve: PointVector[],
    index: number,
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
    this.curve = curve
    this.index = index
    this.strength = strength
    this.color = color
    this.alpha = alpha
    this.thickness = thickness
  }

  twist(from: Coordinate, amount: number) {
    this.rotateAround(vector.set(...from), amount * Math.PI * 2)
    return this
  }

  pull(from: Coordinate, to: Coordinate, amount: number) {
    this.sub(vector.set(...from))
      .lerp(vector2.set(...to), amount)
      .add(vector)
    return this
  }

  stretch(from: Coordinate, to: Coordinate) {
    this.sub(vector.set(...from))
      .multiply(vector2.set(...to))
      .add(vector)
    return this
  }

  randomize(amount: [number, number] = [1, 1]) {
    const v = new Vector2(...amount)
    const ang =
      (this.index
        ? this.curve[this.index - 1].angleTo(this)
        : this.angleTo(this.curve[1])) +
      0.5 * Math.PI * 2
    this.add(
      vector
        .random()
        .subScalar(0.5)
        .multiply(v)
        .rotateAround({ x: 0, y: 0 }, ang)
    )
    return this
  }

  override clone() {
    return new PointVector([this.x, this.y], this.curve, this.index, {
      strength: this.strength,
      color: this.color,
      alpha: this.alpha,
      thickness: this.thickness
    }) as this
  }
}
