import Foundation
@main struct DisplayTests {
 static func main(){
  precondition(ProxyClientPresentation.value([:])=="Unavailable")
  let exact:[String:Any]=["proxyClients":["available":true,"connectedClients":1,"unattributedConnections":0],"active":["webSockets":3]]
  precondition(ProxyClientPresentation.value(exact)=="1")
  precondition(ProxyClientPresentation.connections(exact)=="3")
  let legacy:[String:Any]=["proxyClients":["available":true,"connectedClients":NSNull(),"unattributedConnections":1,"minimumConnectedClients":1]]
  precondition(ProxyClientPresentation.value(legacy)=="≥1")
  precondition(ProxyClientPresentation.detail(legacy).contains("older transport"))
  precondition(ProxyClientPresentation.count(true)==nil)
  precondition(ProxyClientPresentation.count(-1)==nil)
  precondition(ProxyClientPresentation.count(1.5)==nil)
  precondition(ProxyClientPresentation.value(["proxyClients":["available":true,"connectedClients":0]])=="0")
  print("PASS: exact, zero, legacy lower-bound, unavailable, malformed values, connection count and explanation")
 }
}
