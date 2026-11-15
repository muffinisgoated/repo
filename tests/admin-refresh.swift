@main struct PolicyTests {
 static func main(){
  var p=RefreshPolicy()
  precondition(!p.shouldPoll && p.begin()==nil)
  p.visibility(true);p.activation(true)
  let first=p.begin()!;precondition(p.inFlight)
  precondition(p.begin()==nil);precondition(p.queued)
  let done=p.finish(first);precondition(done.accept && done.again && !p.inFlight)
  let second=p.begin()!;p.visibility(false)
  let closed=p.finish(second);precondition(!closed.accept && !closed.again && !p.shouldPoll)
  precondition(p.begin()==nil)
  p.visibility(true);precondition(p.begin() != nil)
  p.activation(false);let interrupted=p.finish(p.generation-1);precondition(!interrupted.accept && !p.shouldPoll)
  p.activation(true);let reopened=p.begin()!;precondition(p.finish(reopened).accept)
  precondition(!p.inFlight && !p.queued)
  print("PASS: launch, one in-flight request, coalescing, close, background invalidation and reopen policy")
 }
}
