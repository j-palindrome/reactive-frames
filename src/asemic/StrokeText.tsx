import { useMemo } from 'react'
import { Brush, BrushSettings, Point } from './Brush'
import invariant from 'tiny-invariant'
import { letters } from './data'
import { range } from 'lodash'
import { Vector2, Vector3, Color } from 'three'

export default function useText(
  text: string
  // { color, a }: { color: Color; a: number }
) {
  return useMemo(() => {
    const curves: Point[][] = []

    for (let i of range(text.length)) {
      const letter = text[i]
      if (!letters[letter]) continue
      curves.push(
        ...letters[letter].map(x =>
          x.map(
            x =>
              ({
                position: new Vector2(
                  (x[0] + i) / text.length,
                  (x[1] / text.length) * 2
                )
              } as Point)
          )
        )
      )
    }
    return curves
  }, [])
}
