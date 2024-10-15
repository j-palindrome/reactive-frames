import { range } from 'lodash'
import Asemic from '../../asemic/asemic'
import { Vector2, Color } from 'three'
import { Brush } from '../../asemic/Brush'

export default function Asemic4() {
  return (
    <Asemic>
      <Brush
        keyframes={[
          {
            curves: range(100).map(() =>
              range(Math.ceil(Math.random() * 4) + 1).map(i => ({
                position: new Vector2().random(),
                // position: new Vector2().random(),
                thickness: Math.random() * 2 + 1,
                alpha: 0.05 / 2
              }))
            )
          },
          {
            curves: range(100).map(() =>
              range(Math.ceil(Math.random() * 4) + 1).map(i => ({
                position: new Vector2().random(),
                // position: new Vector2().random(),
                thickness: Math.random() * 2 + 1,
                alpha: 0.05 / 2
              }))
            )
          }
        ]}
        size={5}
      />
    </Asemic>
  )
}
