import type { OperationEvent } from '../../operations'
export function orderedLane(events:OperationEvent[]) {
  const ordered:{event:OperationEvent;depth:number}[]=[],seen=new Set<string>(),ids=new Set(events.map(e=>e.spanId)),sorted=[...events].sort((a,b)=>(a.offsetMs??Infinity)-(b.offsetMs??Infinity))
  function visit(event:OperationEvent,depth:number){if(seen.has(event.eventId))return;seen.add(event.eventId);ordered.push({event,depth:Math.min(depth,6)});sorted.filter(child=>child.parentSpanId===event.spanId).forEach(child=>visit(child,depth+1))}
  sorted.filter(e=>!e.parentSpanId||!ids.has(e.parentSpanId)).forEach(e=>visit(e,0));sorted.forEach(e=>visit(e,0));return ordered
}
