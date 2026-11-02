import styles from './LoginArtwork.module.css'
const nodes = [[90, 165], [185, 80], [320, 120], [435, 60], [490, 205], [370, 275], [210, 245], [100, 355], [260, 410], [440, 400], [535, 330]]
const edges = [[0, 1], [0, 6], [1, 2], [2, 3], [2, 4], [2, 5], [3, 4], [4, 5], [4, 10], [5, 6], [5, 8], [5, 9], [6, 7], [6, 8], [7, 8], [8, 9], [9, 10]]
export default function LoginArtwork() {
  return <div className={styles.artwork} aria-hidden="true"><div className={styles.grid} /><svg className={styles.network} viewBox="0 0 620 480" fill="none"><circle className={styles.orbit} cx="310" cy="240" r="185" /><circle className={styles.orbit} cx="310" cy="240" r="130" />{edges.map(([a, b]) => <path key={`${a}-${b}`} d={`M ${nodes[a][0]} ${nodes[a][1]} L ${nodes[b][0]} ${nodes[b][1]}`} className={styles.thread} />)}{nodes.map(([x, y], index) => <g key={index} className={styles.node}><circle cx={x} cy={y} r="10" className={styles.halo} /><circle cx={x} cy={y} r="3" className={styles.core} /></g>)}<circle cx="320" cy="120" r="18" className={styles.anchor} /><circle cx="320" cy="120" r="5" className={styles.core} /></svg><span className={styles.caption}>用户 · 服务 · 运行观测</span></div>
}
