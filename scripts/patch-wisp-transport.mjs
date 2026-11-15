// Pinned libcurl transport 2.0.6. A rejected Wisp upgrade must notify every
// pending virtual socket, including peers sharing an existing handshake.
export function patchWispTransport(source) {
 const before = `    on_conn_close() {
      delete _wisp_connections[this.real_url];
    }
    init_connection() {
      this.connection = _wisp_connections[this.real_url];
      if (!this.connection) {
        this.connection = new WispConnection(this.real_url);
        this.connection.addEventListener("open", () => {
          this.init_stream();
        });
        this.connection.addEventListener("close", () => {
          this.on_conn_close();
        });
        this.connection.addEventListener("error", () => {
          this.on_conn_close();
        });
        _wisp_connections[this.real_url] = this.connection;
      } else if (!this.connection.connected) {
        this.connection.addEventListener("open", () => {
          this.init_stream();
        });
      } else {
        this.connection = _wisp_connections[this.real_url];
        this.init_stream();
      }
    }`;
 const after = `    init_connection() {
      const connection = _wisp_connections[this.real_url] ??= new WispConnection(this.real_url);
      this.connection = connection;
      if (connection.connected) {
        this.init_stream();
        return;
      }
      const clear = () => {
        connection.removeEventListener("open", opened);
        connection.removeEventListener("error", failed);
        connection.removeEventListener("close", failed);
      };
      const opened = () => {
        clear();
        this.init_stream();
      };
      const failed = () => {
        clear();
        if (_wisp_connections[this.real_url] === connection) delete _wisp_connections[this.real_url];
        const event = new Event("error");
        this.onerror(event);
        this.dispatchEvent(event);
      };
      connection.addEventListener("open", opened);
      connection.addEventListener("error", failed);
      connection.addEventListener("close", failed);
    }`;
 const cache = '      this.ws = new WebSocket(this.wisp_url);';
 const cleanup = `      if (typeof relayWebSocket === "function") {
        this.connecting = true;
        relayWebSocket(this.wisp_url).then(ws => this.bind_ws(ws), () => {
          this.on_ws_close();
          this.dispatchEvent(new Event("error"));
        });
      } else {
        this.bind_ws(new WebSocket(this.wisp_url));
      }
    }
    bind_ws(ws) {
      this.ws = ws;
      const forget = () => {
        if (_wisp_connections[this.wisp_url] === this) delete _wisp_connections[this.wisp_url];
      };
      this.ws.addEventListener("error", forget);
      this.ws.addEventListener("close", forget);`;
 for (const [oldText,newText] of [[before,after],[cache,cleanup]]) {
  if (source.split(oldText).length !== 2) throw Error('Wisp transport patch target changed');
  source = source.replace(oldText,newText);
 }
 return 'let relayWebSocket;\nexport function setRelayWebSocket(factory){relayWebSocket=factory;}\n'+source;
}
