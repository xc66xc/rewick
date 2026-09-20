import { useRef } from 'react'
import { cn } from '../../lib/cn'

interface SliderProps {
  id?: string
  value: number
  min?: number
  max?: number
  step?: number
  disabled?: boolean
  'aria-label'?: string
  'aria-valuetext'?: string
  onValueChange: (value: number) => void
  onValueCommit: (value: number) => void
  className?: string
}
/** Native range supports pointer, touch and keyboard; commit once when interaction ends. */
export function Slider({ value, min = 0, max = 100, step = 1, disabled, onValueChange, onValueCommit, className, ...props }: SliderProps) {
  const dirty = useRef(false)
  function commit(input: HTMLInputElement) {
    if (!dirty.current || disabled) return
    dirty.current = false
    onValueCommit(input.valueAsNumber)
  }
  return <input {...props} type="range" value={value} min={min} max={max} step={step} disabled={disabled}
    className={cn('h-8 min-h-0 w-full cursor-pointer border-0 bg-transparent p-0 accent-success disabled:cursor-not-allowed disabled:opacity-45', className)}
    onChange={event => { dirty.current = true; onValueChange(event.currentTarget.valueAsNumber) }}
    onPointerUp={event => commit(event.currentTarget)} onPointerCancel={event => commit(event.currentTarget)}
    onBlur={event => commit(event.currentTarget)}
    onKeyUp={event => { if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) commit(event.currentTarget) }} />
}
