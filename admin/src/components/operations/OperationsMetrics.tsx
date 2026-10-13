import layout from '../../pages/OperationsPage.module.css'
interface Props { values: [string, string][] }
export default function OperationsMetrics({ values }: Props) {
  return <dl className={layout.grid}>{values.map(([label, value]) => <div className={layout.card} key={label}><dt className={layout.label}>{label}</dt><dd className={layout.value}>{value}</dd></div>)}</dl>
}
