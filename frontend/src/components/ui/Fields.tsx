import type { SelectOption } from '../../lib/constants'

interface TextFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'search' | 'date'
  placeholder?: string
  className?: string
}

// Labeled text, search or date input used by the filter forms.
export function TextField({ id, label, value, onChange, type = 'text', placeholder, className }: TextFieldProps) {
  const classes = `field${className ? ` ${className}` : ''}`
  return (
    <label className={classes} htmlFor={id}>
      <span className="field__label">{label}</span>
      <input
        id={id}
        className="field__control"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

interface SelectFieldProps {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  className?: string
}

export function SelectField({ id, label, value, onChange, options, className }: SelectFieldProps) {
  const classes = `field${className ? ` ${className}` : ''}`
  return (
    <label className={classes} htmlFor={id}>
      <span className="field__label">{label}</span>
      <select id={id} className="field__control" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  )
}
