import { range } from 'lodash'
import Asemic, { Brush } from '../../asemic/asemic'
import { Vector2, Color } from 'three'

export default function Asemic4() {
  return (
    <Asemic>
      <Brush
        keyframes={[
          {
            curves: range(2000).map(() =>
              range(5).map(i => ({
                position: new Vector2().random(),
                // position: new Vector2().random(),
                thickness: Math.random(),
                color: new Color('white'),
                alpha: 0.1
              }))
            )
          },
          {
            curves: range(2000).map(() =>
              range(5).map(i => ({
                position: new Vector2().random(),
                // position: new Vector2().random(),
                thickness: Math.random(),
                color: new Color('white'),
                alpha: 0.1
              }))
            )
          }
        ]}
        size={1}
        spacing={2}
      />
    </Asemic>
  )
}
