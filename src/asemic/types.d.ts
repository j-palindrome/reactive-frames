import { Color, Vector2 } from 'three'

declare global {
  type Point = {
    position: Vector2
    thickness?: number
    alpha?: number
    color?: Color
  }
}
