import { Anime, AnimeDiv, AnimeObject, Reactive } from '../../src'

export default function TestFramerMotion() {
  return (
    <Reactive className='h-[2000px]'>
      <Anime
        name='framer'
        className='*:fixed'
        parameters={{ duration: 1, easing: 'linear', timelineOffset: '+0' }}>
        <AnimeDiv
          name='obj1'
          className='top-10 left-10'
          parameters={{
            color: [{ value: '#fff' }, { value: '#000' }, { value: '#fff' }],
            translateX: [
              { value: 'calc(0vw)' },
              { value: 'calc(90vw - 100%)' },
              { value: 'calc(0vw - 0%)' },
              { value: 'calc(0vw + 200px)' }
            ],
            duration: 1
          }}>
          some text
        </AnimeDiv>
        <AnimeDiv
          name='obj2'
          className='top-20 left-10'
          parameters={{
            color: [{ value: '#000' }, { value: '#fff' }],
            delay: -0.5,
            duration: 1
          }}>
          some text
        </AnimeDiv>
        <AnimeObject
          name='obj4'
          target={{ x: 20 }}
          parameters={{
            x: 100,
            duration: 1,
            change: a => console.log(a.animatables[0].target)
          }}
        />
      </Anime>
    </Reactive>
  )
}
