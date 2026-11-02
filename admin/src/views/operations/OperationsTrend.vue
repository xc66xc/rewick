<script setup lang="ts">
import {computed,nextTick,onBeforeUnmount,onMounted,ref,watch} from 'vue'
import {drawPath,gsap,motionSkipped} from '../../composables/motion'
import {timingSource,type OperationsPerformance} from '../../operations'
import BarChart from '../../components/charts/BarChart.vue'
const props=defineProps<{trend:OperationsPerformance['trend'];firstContentSource?:'desktop'|'backend'|'unknown'|null}>()
const box=ref<HTMLElement|null>(null),svg=ref<SVGSVGElement|null>(null),width=ref(600),hover=ref<number|null>(null)
const height=240,pad={left:44,right:16,top:22,bottom:32}
const labels=computed(()=>props.trend.map(v=>new Date(v.at).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})))
const sources=computed(()=>[...new Set(props.trend.map(v=>v.source??props.firstContentSource??'unknown'))])
const peak=computed(()=>Math.max(1,...props.trend.flatMap(v=>v.p95Ms===null?[]:[v.p95Ms])))
const ceiling=computed(()=>{const rough=peak.value*1.15/4,mag=10**Math.floor(Math.log10(Math.max(rough,1e-9))),r=rough/mag,step=Math.max(1,(r<=1?1:r<=2?2:r<=5?5:10)*mag);return step*Math.max(1,Math.ceil(peak.value*1.15/step))})
const x=(i:number)=>pad.left+(props.trend.length<=1?(width.value-pad.left-pad.right)/2:i/(props.trend.length-1)*(width.value-pad.left-pad.right))
const y=(value:number)=>pad.top+(height-pad.top-pad.bottom)*(1-value/ceiling.value)
const series=computed(()=>sources.value.map(source=>{const runs:{x:number;y:number;index:number}[][]=[];let run:{x:number;y:number;index:number}[]=[];props.trend.forEach((v,i)=>{if((v.source??props.firstContentSource??'unknown')===source&&v.p95Ms!==null)run.push({x:x(i),y:y(v.p95Ms),index:i});else if(run.length){runs.push(run);run=[]}});if(run.length)runs.push(run);return{source,runs}}))
const ticks=computed(()=>Array.from({length:5},(_,i)=>ceiling.value*i/4))
let observer:ResizeObserver|undefined
async function reveal(){await nextTick();svg.value?.querySelectorAll<SVGPathElement>('.trend-line').forEach(path=>drawPath(path))}
function point(event:PointerEvent){if(!box.value||!props.trend.length)return;const rect=box.value.getBoundingClientRect();hover.value=Math.max(0,Math.min(props.trend.length-1,Math.round((event.clientX-rect.left-pad.left)/Math.max(1,width.value-pad.left-pad.right)*(props.trend.length-1))))}
watch(()=>props.trend,reveal,{deep:true})
onMounted(()=>{if(box.value){observer=new ResizeObserver(()=>{width.value=box.value?.clientWidth??600});observer.observe(box.value)}void reveal()})
onBeforeUnmount(()=>{observer?.disconnect();if(svg.value)gsap.killTweensOf(svg.value.querySelectorAll('*'))})
</script>
<template><div class="stack"><div class="chart-legend"><span v-for="(source,i) in sources" :key="source" class="business-caption"><i class="trend-key" :class="{secondary:i>0}" />{{timingSource(source)}} P95</span></div><div ref="box" class="trend-box" role="img" aria-label="按时间展示回答 P95 耗时与样本数，未知耗时保留空缺" @pointermove="point" @pointerleave="hover=null"><svg ref="svg" :viewBox="`0 0 ${width} ${height}`" width="100%" :height="height"><g v-for="value in ticks" :key="value"><line :x1="pad.left" :x2="width-pad.right" :y1="y(value)" :y2="y(value)" class="trend-grid" /><text :x="pad.left-8" :y="y(value)+4" text-anchor="end" class="trend-label">{{Math.round(value).toLocaleString()}}</text></g><text :x="pad.left" y="12" class="trend-label">ms</text><template v-for="(s,si) in series" :key="s.source"><template v-for="(run,ri) in s.runs" :key="ri"><path v-if="run.length>1" class="trend-line" :class="{secondary:si>0}" :d="run.map((p,i)=>`${i?'L':'M'}${p.x},${p.y}`).join(' ')" fill="none" /><circle v-for="p in run" :key="p.index" :cx="p.x" :cy="p.y" r="3" class="trend-point" :class="{secondary:si>0}" /></template></template><template v-for="(label,i) in labels" :key="i"><text v-if="i%Math.max(1,Math.ceil(labels.length/6))===0||i===labels.length-1" :x="x(i)" :y="height-8" text-anchor="middle" class="trend-label">{{label}}</text></template><line v-if="hover!==null" :x1="x(hover)" :x2="x(hover)" :y1="pad.top" :y2="height-pad.bottom" class="trend-cross" /></svg><div v-if="hover!==null&&trend[hover]" class="trend-readout m-float" role="status"><strong>{{labels[hover]}}</strong><span>{{timingSource(trend[hover].source??firstContentSource)}} P95：{{trend[hover].p95Ms===null?'未知':`${trend[hover].p95Ms} ms`}}</span><span>样本数 {{trend[hover].count}}</span></div></div><p class="business-caption">样本数（独立刻度）</p><BarChart :values="trend.map(v=>v.count)" :labels="labels" unit="样本" :height="150" /></div></template>
<style scoped>
.chart-legend{display:flex;gap:20px;flex-wrap:wrap}.trend-box{position:relative;min-width:0}.trend-key{display:inline-block;width:16px;height:2px;margin:0 6px 4px 0;background:var(--blue)}.trend-key.secondary{background:var(--ink-muted)}.trend-grid{stroke:var(--line)}.trend-label{fill:var(--ink-soft);font:10px var(--font-mono)}.trend-line{stroke:var(--blue);stroke-width:2}.trend-line.secondary{stroke:var(--ink-muted);stroke-dasharray:5 4}.trend-point{fill:var(--blue);stroke:var(--surface-solid);stroke-width:1.5}.trend-point.secondary{fill:var(--ink-muted)}.trend-cross{stroke:var(--tick);stroke-dasharray:3 3}.trend-readout{position:absolute;right:20px;top:8px;display:grid;gap:4px;padding:12px 16px;border-radius:var(--r-sm);font-size:11px;pointer-events:none}
</style>
