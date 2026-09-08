import { forwardRef, type ButtonHTMLAttributes } from 'react'
import styles from '../styles/App.module.css'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> { label: string; active?: boolean }
const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton({ label, active = false, className = '', children, ...props }, ref) {
  return <button ref={ref} type="button" className={`${styles.iconButton} ${active ? styles.iconButtonActive : ''} ${className}`}
    aria-label={label} title={label} {...props}>{children}</button>
})
export default IconButton
