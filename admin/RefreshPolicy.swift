// Shared by the native app and deterministic Swift acceptance tests.
struct RefreshPolicy {
 private(set) var visible=false
 private(set) var active=false
 private(set) var generation=0
 private(set) var inFlight=false
 private(set) var queued=false
 var shouldPoll:Bool {visible && active}
 mutating func visibility(_ value:Bool){visible=value;if !shouldPoll{generation += 1;queued=false}}
 mutating func activation(_ value:Bool){active=value;if !shouldPoll{generation += 1;queued=false}}
 mutating func begin()->Int?{guard shouldPoll else{return nil};if inFlight{queued=true;return nil};inFlight=true;return generation}
 mutating func finish(_ started:Int)->(accept:Bool,again:Bool){inFlight=false;let again=queued&&shouldPoll;queued=false;return(started==generation&&shouldPoll,again)}
}
