import SwiftUI
import AppKit
import CryptoKit
import Security
import Darwin

func ipc(_ value: [String:Any]) throws -> [String:Any] {
 let fd=socket(AF_UNIX,SOCK_STREAM,0);guard fd >= 0 else {throw NSError(domain:"Connection unavailable",code:1)};defer{Darwin.close(fd)}
 var noSigPipe:Int32=1;setsockopt(fd,SOL_SOCKET,SO_NOSIGPIPE,&noSigPipe,socklen_t(MemoryLayout<Int32>.size))
 var timeout=timeval(tv_sec:3,tv_usec:0);setsockopt(fd,SOL_SOCKET,SO_RCVTIMEO,&timeout,socklen_t(MemoryLayout<timeval>.size));setsockopt(fd,SOL_SOCKET,SO_SNDTIMEO,&timeout,socklen_t(MemoryLayout<timeval>.size))
 var address=sockaddr_un();address.sun_family=sa_family_t(AF_UNIX)
 let name="/private/tmp/poxey-web-admin-\(getuid())/service.sock"
 withUnsafeMutableBytes(of:&address.sun_path){ raw in for (i,b) in name.utf8.enumerated(){raw[i]=b};raw[name.utf8.count]=0 }
 let connected=withUnsafePointer(to:&address){p in p.withMemoryRebound(to:sockaddr.self,capacity:1){Darwin.connect(fd,$0,socklen_t(MemoryLayout<sockaddr_un>.size))}}
 guard connected==0 else {throw NSError(domain:"PoxeyX1Admin",code:1,userInfo:[NSLocalizedDescriptionKey:"Local Admin service unavailable. Start the local service to reconnect."])}
 var data=try JSONSerialization.data(withJSONObject:value,options:[.sortedKeys,.withoutEscapingSlashes]);data.append(10)
 try data.withUnsafeBytes{raw in var sent=0;while sent<data.count {let n=Darwin.write(fd,raw.baseAddress!.advanced(by:sent),data.count-sent);guard n>0 else {throw NSError(domain:"Send failed",code:1)};sent+=n}}
 var result=Data();var bytes=[UInt8](repeating:0,count:4096)
 while result.count<262144 {let n=Darwin.read(fd,&bytes,bytes.count);if n<=0{break};result.append(contentsOf:bytes.prefix(n));if result.contains(10){break}}
 let object=try JSONSerialization.jsonObject(with:result) as? [String:Any] ?? [:]
 guard object["ok"] as? Bool == true else {throw NSError(domain:"PoxeyX1Admin",code:1,userInfo:[NSLocalizedDescriptionKey:object["error"] as? String ?? "Access denied"])}
 return object["result"] as? [String:Any] ?? ["items":object["result"] ?? []]
}
func deviceKey() throws -> Curve25519.Signing.PrivateKey {
 let q:[String:Any]=[kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:"PoxeyX1.WebAdmin.Device",kSecAttrAccount as String:"signing-key",kSecReturnData as String:true]
 var item:CFTypeRef?;let status=SecItemCopyMatching(q as CFDictionary,&item)
 if status==errSecSuccess,let raw=item as? Data{return try Curve25519.Signing.PrivateKey(rawRepresentation:raw)}
 guard status==errSecItemNotFound else {throw NSError(domain:"Keychain access unavailable",code:Int(status))}
 let key=Curve25519.Signing.PrivateKey();var add=q;add.removeValue(forKey:kSecReturnData as String);add[kSecValueData as String]=key.rawRepresentation;add[kSecAttrAccessible as String]=kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
 let saved=SecItemAdd(add as CFDictionary,nil);guard saved==errSecSuccess else {throw NSError(domain:"Cannot save device key",code:Int(saved))};return key
}
func signedOperation(_ op:[String:Any], device:String) throws -> [String:Any] {
 let body=try JSONSerialization.data(withJSONObject:op,options:[.sortedKeys,.withoutEscapingSlashes])
 let digest=SHA256.hash(data:body).map{String(format:"%02x",$0)}.joined()
 let challenge=try ipc(["kind":"challenge","device":device,"digest":digest])
 guard let nonce=challenge["nonce"] as? String else {throw NSError(domain:"Invalid authentication response",code:1)}
 let signature=try deviceKey().signature(for:Data(nonce.utf8)).base64EncodedString()
 return try ipc(["kind":"operation","auth":["device":device,"nonce":nonce,"signature":signature],"operation":op])
}
@MainActor final class Model:ObservableObject {
 @Published var section="Overview";@Published var state="Disconnected";@Published var metrics:[String:Any]=[:]
 @Published var request="";@Published var fingerprint="";@Published var busy=false
 @Published var devices:[[String:Any]]=[];@Published var pending:[[String:Any]]=[];@Published var controls:[String:Any]=[:]
 @Published var invitation="";@Published var invitationInput="";@Published var notice=""
 private var policy=RefreshPolicy();private var polling:Task<Void,Never>?;private var observers:[NSObjectProtocol]=[];private weak var window:NSWindow?
 init(){
  let center=NotificationCenter.default
  for name in [NSApplication.didBecomeActiveNotification,NSWindow.didBecomeKeyNotification,NSWindow.willCloseNotification,NSWindow.didMiniaturizeNotification,NSWindow.didDeminiaturizeNotification]{
   observers.append(center.addObserver(forName:name,object:nil,queue:.main){[weak self] event in
    Task{@MainActor [weak self] in guard let self=self else{return}
     if name==NSApplication.didBecomeActiveNotification{self.policy.activation(true);self.resume(force:true)}
     else if let target=event.object as? NSWindow,target===self.window {
      if name==NSWindow.willCloseNotification || name==NSWindow.didMiniaturizeNotification{self.policy.visibility(false);self.pause()}
      else{self.policy.visibility(true);self.policy.activation(true);self.resume()}
     }
    }
   })
  }
 }
 deinit{polling?.cancel();for token in observers{NotificationCenter.default.removeObserver(token)}}
 func attach(_ window:NSWindow){self.window=window;policy.visibility(!window.isMiniaturized);policy.activation(true);resume()}
 private func pause(){polling?.cancel();polling=nil;metrics=[:];state="Paused · refresh resumes when the window is active"}
 private func resume(force:Bool=false){guard policy.shouldPoll else{return};if polling != nil{if force{connect()};return};connect();
  polling=Task{[weak self] in while !Task.isCancelled{do{try await Task.sleep(nanoseconds:5_000_000_000)}catch{return};guard let self=self,!Task.isCancelled,self.policy.shouldPoll else{return};if UserDefaults.standard.string(forKey:"device") != nil{self.connect()}}}
 }
 func connect(){if let stamp=metrics["timestamp"] as? String,let at=Self.parseDate(stamp),Date().timeIntervalSince(at)>=15{metrics=[:]};guard let generation=policy.begin() else{return};busy=true;state="Refreshing…";let prior=UserDefaults.standard.string(forKey:"device"),inv=invitationInput
 Task {do {
  let response=try await Task.detached {() throws -> [String:Any] in
   if let device=prior{return try signedOperation(["action":"metrics"],device:device)}
   let key=try deviceKey();let header=Data([0x30,0x2a,0x30,0x05,0x06,0x03,0x2b,0x65,0x70,0x03,0x21,0x00]);let pub=header+key.publicKey.rawRepresentation
   return try ipc(["kind":"enroll","name":Host.current().localizedName ?? "Mac","key":pub.base64EncodedString(),"invitation":inv])
  }.value
  let next=policy.finish(generation);busy=false
  if next.accept {
   if let id=response["requestId"] as? String{request=id;fingerprint=response["publicKeyFingerprint"] as? String ?? "";state="Local owner approval required"}
   else if let stamp=response["timestamp"] as? String,let at=Self.parseDate(stamp),Date().timeIntervalSince(at)<15,Date().timeIntervalSince(at) >= -1 {metrics=response;state="Connected · data updated \(at.formatted(date:.omitted,time:.standard))"}
   else{metrics=[:];state="Offline · measurements are stale or unavailable"}
  }
  if next.again{connect()}
 }catch{let next=policy.finish(generation);busy=false;if next.accept{metrics=[:];notice="";state="Offline · \(error.localizedDescription)"};if next.again{connect()}}
 }
 }
 static func parseDate(_ value:String)->Date?{let f=ISO8601DateFormatter();f.formatOptions=[.withInternetDateTime,.withFractionalSeconds];return f.date(from:value)}
 func checkApproval(){guard !request.isEmpty,let generation=policy.begin() else{return};busy=true;let id=request
 Task{do{let r=try await Task.detached{try ipc(["kind":"status","requestId":id])}.value;let next=policy.finish(generation);busy=false;if next.accept,let device=r["device"] as? String{UserDefaults.standard.set(device,forKey:"device");request="";connect()}else if next.accept{state="Approval is still pending";if next.again{connect()}}}catch{let next=policy.finish(generation);busy=false;if next.accept{state=error.localizedDescription};if next.again{connect()}}}
 }
 func run(_ op:[String:Any], completion:@escaping([String:Any])->Void={_ in}){
 guard let device=UserDefaults.standard.string(forKey:"device"),let generation=policy.begin() else{return};busy=true
 Task{do{let result=try await Task.detached{try signedOperation(op,device:device)}.value;let next=policy.finish(generation);busy=false;if next.accept{completion(result);notice="Operation completed"};if policy.shouldPoll && (next.again || ["stage-setting","rollback-settings"].contains(op["action"] as? String ?? "")){connect()}}catch{let next=policy.finish(generation);busy=false;if next.accept{notice="Operation unavailable or not authorized"};if next.again{connect()}}}
 }
 func loadAccess(){run(["action":"devices"]){self.devices=$0["items"] as? [[String:Any]] ?? []}}
 func loadPending(){run(["action":"pending"]){self.pending=$0["items"] as? [[String:Any]] ?? []}}
 func loadControls(){run(["action":"controls"]){self.controls=$0}}
}
struct WindowProbe:NSViewRepresentable {
 let model:Model
 final class Probe:NSView {var attached:((NSWindow)->Void)?;override func viewDidMoveToWindow(){super.viewDidMoveToWindow();if let window=window{DispatchQueue.main.async{[weak self,weak window] in if let window=window{self?.attached?(window)}}}}}
 func makeNSView(context:Context)->Probe{let view=Probe();view.attached={window in model.attach(window)};return view}
 func updateNSView(_ view:Probe,context:Context){}
}
@MainActor final class AdminDelegate:NSObject,NSApplicationDelegate {
 func applicationShouldHandleReopen(_ sender:NSApplication,hasVisibleWindows:Bool)->Bool{if !hasVisibleWindows,let window=sender.windows.first(where:{$0.title=="PoxeyX1 Admin"}){window.makeKeyAndOrderFront(nil)};return true}
}
struct Dashboard:View {
 @ObservedObject var model:Model;@AppStorage("appearance") private var appearance="System"
 @State private var controlKey="webSockets";@State private var proposed="6";@State private var confirmation=false
 @State private var pendingOperation:[String:Any]=[:]
 @State private var arcadeSearch="";@State private var arcadeSort="launches"
 let sections=["Overview","Arcade","Traffic","Performance","Security","Controls","Access Management"]
 var body:some View {NavigationSplitView {List(sections,id:\.self,selection:$model.section){Text($0)}.navigationTitle("PoxeyX1 Admin").navigationSplitViewColumnWidth(min:190,ideal:210,max:260)
 VStack(alignment:.leading,spacing:8){Text("LOCAL CONNECTION").font(.caption).foregroundStyle(.secondary);Text(model.metrics.isEmpty ? "Disconnected" : "Connected").font(.callout);Text("Owner access · this Mac").font(.caption).foregroundStyle(.secondary);Picker("Appearance",selection:$appearance){Text("System").tag("System");Text("Dark").tag("Dark");Text("Light").tag("Light")}.labelsHidden()}.padding()
 }detail:{ScrollView{VStack(alignment:.leading,spacing:22){HStack{Text(model.section).font(.largeTitle.bold());Spacer();if model.busy{ProgressView().controlSize(.small)};Button("Refresh"){model.connect()}.disabled(model.busy)}
 Text(model.state).foregroundStyle(.secondary)
 if !model.notice.isEmpty{Text(model.notice).font(.callout).foregroundStyle(.secondary)}
 if !model.request.isEmpty {GroupBox("Approve this Mac"){VStack(alignment:.leading,spacing:12){Text("In the local Admin service console, inspect this request and compare the entire fingerprint before approving.");Text(model.request).textSelection(.enabled);Text(model.fingerprint).font(.system(.caption,design:.monospaced)).textSelection(.enabled);Button("Check approval"){model.checkApproval()}}.padding(8)}}
 if UserDefaults.standard.string(forKey:"device")==nil && model.request.isEmpty{Text("Installing this app does not grant administrator access.");SecureField("Viewer invitation (optional)",text:$model.invitationInput);Button("Connect and request enrollment"){model.connect()}}
 if model.section=="Controls" {controlView}
 else if model.section=="Access Management" {accessView}
 else if !model.metrics.isEmpty {metricView}
 else {Text("No live measurements. Stale or disconnected data is never presented as current.").foregroundStyle(.secondary)}
 Text("Private connection · refreshes every 5 seconds while open").font(.caption).foregroundStyle(.secondary)
 }.padding(28)}}.frame(minWidth:780,minHeight:560).preferredColorScheme(appearance=="System" ? nil:appearance=="Dark" ? .dark:.light)
 .background(WindowProbe(model:model).frame(width:0,height:0))
 .confirmationDialog("Confirm administrative change",isPresented:$confirmation,titleVisibility:.visible){Button("Confirm"){model.run(pendingOperation){result in if result["ranges"] != nil{model.controls=result}}};Button("Cancel",role:.cancel){}}message:{Text("Settings affect the next controlled preview-server restart. Revocation immediately denies that device access.")}}
 var metricView:some View{VStack(alignment:.leading,spacing:20){
 LazyVGrid(columns:[GridItem(.adaptive(minimum:180))],spacing:14){ForEach(cards(),id:\.0){label,value in VStack(alignment:.leading,spacing:10){Text(label).font(.callout).foregroundStyle(.secondary);Text(value).font(.title2.weight(.semibold)).textSelection(.enabled)}.frame(maxWidth:.infinity,minHeight:80,alignment:.leading).padding(16).background(.quaternary.opacity(0.25),in:RoundedRectangle(cornerRadius:14))}}
 if model.section=="Arcade"{arcadeView}
 if model.section=="Overview"{
 GroupBox("What these numbers mean"){VStack(alignment:.leading,spacing:10){
 Text("Connected Clients · currently connected Poxey workspace sessions, grouped across their proxy connections. These are not verified people.")
 Text(ProxyClientPresentation.detail(model.metrics))
 Text("Wisp Connections · open proxy transports. Reported Active Sessions · optional reporting sessions seen in the last 5 minutes.")
 Text("Optional reporting is off by default and never reports in Private mode. Live operational presence still counts connected transports anonymously, without cookies or a saved identifier. Visitor counting is a separate choice.")
 Text("Visitors · estimated consenting browsers, not verified people. Clearing browser storage may create a new visitor.")
 Text(visitorStatus()).font(.caption).foregroundStyle(.secondary)
 }.font(.callout).frame(maxWidth:.infinity,alignment:.leading).padding(8)}
 GroupBox("AI usage"){VStack(alignment:.leading,spacing:10){
 Text(aiSummary()).font(.callout)
 Text("Shared application budget, not Google's remaining quota. Failed provider attempts still use shared capacity; unsuccessful replies refund personal message allowances.").font(.caption).foregroundStyle(.secondary)
 DisclosureGroup("Allowance and error details"){Text(aiDetails()).font(.system(.caption,design:.monospaced)).textSelection(.enabled)}
 }.frame(maxWidth:.infinity,alignment:.leading).padding(8)}
 }

 DisclosureGroup("Advanced · diagnostic details"){ForEach(groups(),id:\.0){name,value in VStack(alignment:.leading){Text(name).font(.headline);Text(value).font(.system(.caption,design:.monospaced)).textSelection(.enabled)}.frame(maxWidth:.infinity,alignment:.leading).padding(.vertical,8)}}
 }}
 var arcadeView:some View{VStack(alignment:.leading,spacing:14){
 Text("Open game frames, not proof of active gameplay. Clients are temporary workspace sessions, not unique people.").font(.callout).foregroundStyle(.secondary)
 Text(ArcadePresentation.coverage(model.metrics)).font(.caption).foregroundStyle(.secondary)
 HStack{TextField("Search games",text:$arcadeSearch).textFieldStyle(.roundedBorder);Picker("Sort",selection:$arcadeSort){Text("Most launches").tag("launches");Text("Fewest launches").tag("fewest");Text("Clients online").tag("clients");Text("Open sessions").tag("sessions");Text("Game name").tag("name")}.frame(maxWidth:230)}
 ScrollView(.horizontal){VStack(alignment:.leading,spacing:0){
 HStack{Text("Game").frame(width:240,alignment:.leading);Text("Clients now").frame(width:95);Text("Sessions").frame(width:95);Text("Launches").frame(width:95)}.font(.caption.bold()).foregroundStyle(.secondary).padding(.vertical,10)
 ForEach(ArcadePresentation.rows(model.metrics,query:arcadeSearch,sort:arcadeSort),id:\.id){game in
 HStack{VStack(alignment:.leading){Text(game.name);if !game.status.isEmpty{Text(game.status).font(.caption).foregroundStyle(.secondary)}}.frame(width:240,alignment:.leading);Text(String(game.clients)).frame(width:95);Text(String(game.sessions)).frame(width:95);Text(game.launches).frame(width:95)}.font(.callout).padding(.vertical,10);Divider()
 }
 }.frame(minWidth:550,alignment:.topLeading)}.fixedSize(horizontal:false,vertical:true)
 if ArcadePresentation.rows(model.metrics,query:arcadeSearch,sort:arcadeSort).isEmpty{Text("No matching games, or Arcade measurements are unavailable.").foregroundStyle(.secondary)}
 }}
 var controlView:some View{VStack(alignment:.leading,spacing:14){Text("Safe limits").font(.title2);Text("Stage a bounded setting for the next server restart. Running connections are preserved. Changes cannot exceed the tested Stage 4 defaults.")
 Button("Read settings"){model.loadControls()}
 Picker("Setting",selection:$controlKey){Text("Wisp connections · 1–6").tag("webSockets");Text("Global streams · 8–128").tag("streamsGlobal");Text("HTTP requests/sec · 10–120").tag("httpPerSecond");Text("TCP idle timeout (ms) · 15000–120000").tag("tcpIdleMs")}
 TextField("Proposed value",text:$proposed).frame(maxWidth:200)
 if let next=model.controls["next"] as? [String:Any]{Text("Next restart: \(String(describing:next[controlKey] ?? "Unavailable"))")}
 if let applied=model.metrics["appliedLimits"] as? [String:Any]{Text("Running server: \(String(describing:applied[controlKey] ?? "Unavailable"))")}else{Text("Running settings: Unavailable until the collector is restarted with this update.").foregroundStyle(.secondary)}
 Button("Stage change…"){if let n=Int(proposed){pendingOperation=["action":"stage-setting","key":controlKey,"value":n];confirmation=true}else{model.notice="Enter a whole number in the allowed range"}}
 Button("Roll back staged settings…"){pendingOperation=["action":"rollback-settings"];confirmation=true}.disabled(model.controls["canRollback"] as? Bool != true)
 }}
 var accessView:some View{VStack(alignment:.leading,spacing:14){Text("Authorized devices").font(.title2);HStack{Button("Refresh devices"){model.loadAccess()};Button("Pending requests"){model.loadPending()};Button("Create viewer invitation"){model.run(["action":"invite"]){model.invitation=$0["invitation"] as? String ?? ""}}}
 if !model.invitation.isEmpty{Text("One use · expires in 5 minutes · share privately").font(.caption);Text(model.invitation).font(.system(.caption,design:.monospaced)).textSelection(.enabled);Button("Hide invitation"){model.invitation=""}}
 ForEach(model.devices.indices,id:\.self){i in let d=model.devices[i];GroupBox{VStack(alignment:.leading,spacing:6){Text(d["name"] as? String ?? "Device").font(.headline);Text("\(d["role"] as? String ?? "") · enrolled \(d["enrolledAt"] as? String ?? "")").font(.caption);Text("Last authentication: \(d["lastAuthenticated"] as? String ?? "Not yet authenticated")").font(.caption);if d["revoked"] as? Bool == true{Text("Revoked")}else if d["role"] as? String != "owner"{Button("Revoke…"){pendingOperation=["action":"revoke","deviceId":d["id"] as? String ?? ""];confirmation=true}}}.frame(maxWidth:.infinity,alignment:.leading)}}
 ForEach(model.pending.indices,id:\.self){i in let d=model.pending[i];HStack{VStack(alignment:.leading){Text(d["name"] as? String ?? "Pending viewer");Text(d["publicKeyFingerprint"] as? String ?? "").font(.system(.caption,design:.monospaced)).textSelection(.enabled)};Button("Approve viewer…"){pendingOperation=["action":"approve-viewer","requestId":d["id"] as? String ?? ""];confirmation=true}}}
 Text("Owner-only actions are checked by the service. Remote administration is disabled; invitations are usable only with this local service.").font(.caption).foregroundStyle(.secondary)
 }}
 func number(_ group:String,_ key:String,suffix:String="",scale:Double=1)->String{guard let v=(model.metrics[group] as? [String:Any])?[key] as? NSNumber else{return "Unavailable"};return String(format:"%.1f",v.doubleValue/scale)+suffix}
 func visitorCount(_ key:String)->String{guard let v=model.metrics["visitors"] as? [String:Any] else{return "Unavailable"};guard v["status"] as? String == "available" else{return v["status"] as? String == "disabled" ? "Disabled":"Unavailable"};guard let n=v[key] as? Int else{return "Unavailable"};return String(n)}
 func visitorStatus()->String{guard let v=model.metrics["visitors"] as? [String:Any],v["status"] as? String == "available",let stamp=v["startedAt"] as? String,let at=Model.parseDate(stamp) else{return "Visitor analytics disabled or unavailable"};return "Analytics started \(at.formatted(date:.abbreviated,time:.shortened)) · estimated opt-in browsers, not verified people"}
 func sessionCount()->String{guard let value=(model.metrics["sessions"] as? [String:Any])?["activeSessions"] as? Int else{return "Unavailable"};return String(value)}
 func cards()->[(String,String)]{switch model.section{
 case "Arcade":return ArcadePresentation.cards(model.metrics)
 case "Traffic":return [("Wisp connections",number("active","webSockets")),("Active streams",number("active","streams")),("Local requests / sec",number("http","requestsPerSecond")),("Response KiB / sec",number("http","bodyBytesPerSecond",scale:1024)),("HTTP failures",number("counters","httpFailures")),("Rate-limit events",number("counters","rateLimits"))]
 case "Performance":return [("HTTP p50",number("http","p50Ms",suffix:" ms")),("HTTP p95",number("http","p95Ms",suffix:" ms")),("Process CPU",number("system","cpuCorePercent",suffix:"% / core")),("Process RSS",number("system","rssBytes",suffix:" MiB",scale:1048576)),("Queued data",number("active","queuedBytes",suffix:" KiB",scale:1024)),("Event-loop p95",number("system","eventLoopP95Ms",suffix:" ms"))]
 case "Security":return [("Rejected upgrades",number("counters","wsRejected")),("Rejected streams",number("counters","streamRejected")),("Rate-limit events",number("counters","rateLimits")),("Queue overflows",number("counters","queueOverflows")),("Unsafe destination subset","Unavailable"),("Admin auth failures · retained audit",number("admin","authenticationRejectionsRetained")),("Settings changes · retained audit",number("admin","configurationChangesRetained"))]
 default:return [("Connected Clients",ProxyClientPresentation.value(model.metrics)),("Wisp Connections",ProxyClientPresentation.connections(model.metrics)),("Reported Active Sessions",sessionCount()),("All-Time Visitors",visitorCount("allTimeVisitors")),("Last 30 Days",visitorCount("last30Days")),("AI Usage · attempts today",aiAttempts()),("System Health",systemHealth())]}}
 func aiAttempts()->String{guard let ai=model.metrics["ai"] as? [String:Any],let budget=ai["budget"] as? [String:Any],let calls=budget["calls"] as? Int else{return "Unavailable"};return String(calls)}
 func systemHealth()->String{guard let service=model.metrics["service"] as? [String:Any] else{return "Unavailable"};return service["listenersReady"] as? Bool == true ? "Healthy · local server":"Warning · check connection"}
 func aiSummary()->String{guard let ai=model.metrics["ai"] as? [String:Any] else{return "AI information unavailable"};guard ai["available"] as? Bool == true else{return "AI service unavailable · check Advanced details"};let failures=ai["failures"] as? Int ?? 0;let successes=ai["successes"] as? Int ?? 0;return "Configured · \(successes) completed answers · \(failures) failed attempts since server start. Provider availability can change."}
 func aiDetails()->String{guard let ai=model.metrics["ai"] as? [String:Any],let budget=ai["budget"] as? [String:Any],let limits=budget["limits"] as? [String:Any],let cap=limits["globalDailyCalls"] as? Int,let calls=budget["calls"] as? Int,let pacific=budget["geminiAttemptsInProviderDay"] as? Int else{return "No current allowance measurements"};return "Application attempt slots remaining: \(max(0,min(cap-calls,cap-pacific))) / \(cap)\nUTC day: \(budget["day"] as? String ?? "Unavailable") · resets 00:00 UTC\nPacific provider day: \(budget["providerDay"] as? String ?? "Unavailable") · resets midnight Pacific\nToken and monthly limits can apply sooner. Desktop shares Google's project.\nLast provider status: \(String(describing:ai["lastProviderHTTPStatus"] ?? "None recorded"))\nLast error: \(String(describing:ai["lastErrorCode"] ?? "None recorded"))"}

 func groups()->[(String,String)]{let keys=["timestamp","service","visitors","sessions","proxyClients","arcade","active","http","system","counters","ai","unavailable"];return keys.map{k in let data=try? JSONSerialization.data(withJSONObject:model.metrics[k] ?? "Unavailable",options:[.prettyPrinted,.sortedKeys,.fragmentsAllowed]);return(k,data.flatMap{String(data:$0,encoding:.utf8)} ?? "Unavailable")}}
}
// BEGIN ARCADE PRESENTATION
// Pure projection of owner-authorized aggregate metrics; no new authentication path.
struct ArcadeRow:Identifiable {let id:String;let name:String;let clients:Int;let sessions:Int;let launches:String;let total:Int;let status:String}
enum ArcadePresentation {
 static func data(_ metrics:[String:Any])->[String:Any]?{guard let a=metrics["arcade"] as? [String:Any],a["available"] as? Bool == true else{return nil};return a}
 static func value(_ a:[String:Any]?,_ key:String)->String{guard let a=a,let n=ProxyClientPresentation.count(a[key]) else{return "Unavailable"};return String(n)}
 static func cards(_ metrics:[String:Any])->[(String,String)]{let a=data(metrics),history=a?["historyAvailable"] as? Bool == true;return [("Arcade Clients Online",value(a,"clientsOnline")),("Open Game Sessions",value(a,"openSessions")),("Total Game Launches",history ? value(a,"totalLaunches"):"Unavailable"),("Most Popular Game",history ? (a?["mostPopular"] as? String ?? "No launches yet"):"Unavailable")]}
 static func coverage(_ metrics:[String:Any])->String{guard let a=data(metrics) else{return "Arcade monitoring unavailable. Older servers do not report Arcade activity."};let date=(a["startedAt"] as? String).flatMap{stamp -> Date? in let f=ISO8601DateFormatter();f.formatOptions=[.withInternetDateTime,.withFractionalSeconds];return f.date(from:stamp)};let since=date.map{" · since \($0.formatted(date:.abbreviated,time:.shortened))"} ?? "";return (a["historyAvailable"] as? Bool == true ? "Launch totals: reporting-enabled, non-Private sessions only"+since:"Historical totals unavailable; live presence remains separate")+". Popularity is measured by counted launches, not people."}
 static func rows(_ metrics:[String:Any],query:String,sort:String)->[ArcadeRow]{guard let a=data(metrics),let games=a["games"] as? [[String:Any]] else{return []};let history=a["historyAvailable"] as? Bool == true;return games.compactMap{g->ArcadeRow? in guard let id=g["id"] as? String,let name=g["name"] as? String,query.isEmpty||name.localizedCaseInsensitiveContains(query) else{return nil};let total=ProxyClientPresentation.count(g["launches"]) ?? 0;return ArcadeRow(id:id,name:name,clients:ProxyClientPresentation.count(g["clients"]) ?? 0,sessions:ProxyClientPresentation.count(g["sessions"]) ?? 0,launches:history ? String(total):"Unavailable",total:total,status:g["retired"] as? Bool == true ? "Retired":g["disabled"] as? Bool == true ? "Unavailable in library":"")}.sorted{l,r in let delta=sort=="fewest" ? l.total-r.total:sort=="clients" ? r.clients-l.clients:sort=="sessions" ? r.sessions-l.sessions:sort=="name" ? 0:r.total-l.total;if delta != 0{return delta<0};let order=l.name.localizedCaseInsensitiveCompare(r.name);return order == .orderedSame ? l.id<r.id:order == .orderedAscending}}
}
// END ARCADE PRESENTATION
// BEGIN CONNECTED CLIENT PRESENTATION
// Pure formatting only; authentication and collector values remain server-owned.
enum ProxyClientPresentation {
 static func count(_ value:Any?) -> Int? {guard let n=value as? NSNumber,CFGetTypeID(n) != CFBooleanGetTypeID(),n.doubleValue>=0,n.doubleValue.rounded()==n.doubleValue,n.doubleValue<=Double(Int.max) else{return nil};return n.intValue}
 static func value(_ metrics:[String:Any])->String {
  guard let p=metrics["proxyClients"] as? [String:Any],p["available"] as? Bool == true else{return "Unavailable"}
  if let exact=count(p["connectedClients"]){return String(exact)}
  if let unknown=count(p["unattributedConnections"]),unknown>0,let minimum=count(p["minimumConnectedClients"]),minimum>0{return "≥"+String(minimum)}
  return "Unavailable"
 }
 static func connections(_ metrics:[String:Any])->String {guard let active=metrics["active"] as? [String:Any],let n=count(active["webSockets"]) else{return "Unavailable"};return String(n)}
 static func detail(_ metrics:[String:Any])->String {
  guard let p=metrics["proxyClients"] as? [String:Any],p["available"] as? Bool == true else{return "Client grouping is unavailable. Wisp Connections still shows transport usage."}
  if let n=count(p["unattributedConnections"]),n>0{return "At least this many client sessions are connected. \(n) older transport(s) lack a grouping ID; reload that Poxey workspace when convenient for an exact count."}
  return "A temporary ID exists only while each workspace page is open. Disconnects remove presence; unresponsive transports expire within about 60 seconds. A new workspace or reload is a new session. No history or fingerprint is kept."
 }
}
// END CONNECTED CLIENT PRESENTATION
@main struct AdminApp:App {@NSApplicationDelegateAdaptor(AdminDelegate.self) var delegate;@StateObject private var model=Model();var body:some Scene{Window("PoxeyX1 Admin",id:"admin"){Dashboard(model:model)}}}
