import { FrameComponent } from '../blocks/FrameChildComponents'
import { omit } from 'lodash'
import { ParentProps } from '../types'

const Call = <K,>(props: ParentProps<{ options?: K }, K>) => (
  <FrameComponent
    options={omit(props, 'children')}
    getSelf={options => {
      return options as K
    }}>
    {props.children}
  </FrameComponent>
)
export default Call
