// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { Slider } from '../../src/renderer/src/components/ui/slider'

afterEach(cleanup)

it('previews continuously and commits once on release or keyboard completion', () => {
  const commit = vi.fn()
  function Example() {
    const [value, setValue] = useState(20)
    return <Slider aria-label="不透明度" value={value} onValueChange={setValue} onValueCommit={commit} />
  }
  render(<Example />)
  const slider = screen.getByRole('slider') as HTMLInputElement
  fireEvent.change(slider, { target: { value: '31' } })
  fireEvent.change(slider, { target: { value: '32' } })
  expect(slider.value).toBe('32')
  expect(commit).not.toHaveBeenCalled()
  fireEvent.pointerUp(slider)
  fireEvent.blur(slider)
  expect(commit).toHaveBeenCalledExactlyOnceWith(32)
  fireEvent.change(slider, { target: { value: '33' } })
  fireEvent.keyUp(slider, { key: 'ArrowRight' })
  expect(commit).toHaveBeenLastCalledWith(33)
  expect(commit).toHaveBeenCalledTimes(2)
})
