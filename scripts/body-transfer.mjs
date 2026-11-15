export function createBodyTransfer() {
 const probe = new MessageChannel();
 let nativeStreams = false;
 try { const stream = new ReadableStream(); probe.port1.postMessage(stream, [stream]); nativeStreams = true; }
 catch {} finally { probe.port1.close(); probe.port2.close(); }
 function encode(body) {
  if (!(body instanceof ReadableStream)) return {body, transfer: body instanceof ArrayBuffer ? [body] : []};
  if (nativeStreams) return {body, transfer: [body]};
  const reader = body.getReader();
  const {port1: source, port2: destination} = new MessageChannel();
  let closed = false, pumping = false;
  source.onmessage = async ({data}) => {
   if (data === 'cancel') {closed = true; source.close(); try {await reader.cancel();} catch {} return;}
   const credit = data === 'pull' ? 1 : data?.type === 'pull' && data?.window === 4 ? 4 : 0;
   if (closed || pumping || !credit) return;
   pumping = true;
   try {
    // A four-chunk credit window removes serial request round trips without
    // waiting to fill a batch. Slow streams still deliver their first chunk immediately.
    for (let i = 0; i < credit && !closed; i++) {
     const {done, value} = await reader.read();
     if (closed) break;
     source.postMessage({done, value, remaining: credit - i - 1});
     if (done) {closed = true; source.close(); break;}
    }
   } catch (error) {if (!closed) {source.postMessage({error: String(error)}); closed = true; source.close();}}
   finally {pumping = false;}
  };
  return {body: destination, transfer: [destination]};
 }
 function decode(body) {
  if (!(body instanceof MessagePort)) return body;
  let finishPull, remaining = 0, closed = false;
  return new ReadableStream({
   start(controller) {body.onmessage = ({data}) => {
    if (closed) return;
    remaining = Number.isInteger(data.remaining) && data.remaining >= 0 && data.remaining < 4 ? data.remaining : 0;
    if (data.error !== undefined) {closed = true; body.close(); controller.error(new Error(data.error));}
    else if (data.done) {closed = true; body.close(); controller.close();}
    else controller.enqueue(data.value);
    finishPull?.(); finishPull = null;
   };},
   pull() {return new Promise(resolve => {finishPull = resolve; if (!remaining) {remaining = 4; body.postMessage({type: 'pull', window: 4});}});},
   cancel() {closed = true; body.postMessage('cancel'); body.close(); finishPull?.(); finishPull = null;}
  }, {highWaterMark: 0});
 }
 return {encode, decode};
}
