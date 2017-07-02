namespace app.HTTP {
  "use strict";

  export class Request {
    method: string;
    url: string;
    mimeType: string|null;
    timeout: number;
    headers: {[index:string]: string;};
    preventCache: boolean;
    private xhr: XMLHttpRequest;

    constructor (
      method: string,
      url: string,
      params: {
        mimeType?: string;
        headers?: {[index:string]: string;};
        timeout?: number;
        preventCache?: boolean;
      } = {}
    ) {
      this.method = method;
      this.url = url;

      this.mimeType = params.mimeType || null;
      this.timeout = params.timeout || 30000;
      this.headers = params.headers || {}
      this.preventCache = params.preventCache || false;
    }

    send (callback:Function):void {
      var res, xhr:XMLHttpRequest, url:string, key:string,
        val:string;

      url = this.url;

      if (this.preventCache) {
        if (res = /\?(.*)$/.exec(url)) {
          if (res[1].length > 0) {
            url += `&_=${Date.now()}`;
          }
          else {
            url += `_=${Date.now()}`;
          }
        }
        else {
          url += `?=${Date.now()}`;
        }
      }

      xhr = new XMLHttpRequest();

      xhr.open(this.method, url);

      if (this.mimeType !== null) {
        xhr.overrideMimeType(this.mimeType);
      }

      xhr.timeout = this.timeout;

      for (key in this.headers) {
        val = this.headers[key];

        xhr.setRequestHeader(key, val);
      }

      xhr.on("loadend", () => {
        var resonseHeaders;

        resonseHeaders = Request.parseHTTPHeader(xhr.getAllResponseHeaders());

        callback(new Response(xhr.status, resonseHeaders, xhr.responseText, xhr.responseURL));
      });

      xhr.on("timeout", () => {
        callback(new Response(0));
      });

      xhr.on("abort", () => {
        callback(new Response(0));
      });

      xhr.send();

      this.xhr = xhr;
    }

    abort ():void {
      this.xhr.abort();
    }

    static parseHTTPHeader (str: string):{[index:string]: string;} {
      var reg, res, headers, last;

      reg = /^(?:([a-z\-]+):\s*|([ \t]+))(.+)\s*$/gim;
      headers = {};
      last = null;

      while (res = reg.exec(str)) {
        if (typeof res[1] !== "undefined") {
          headers[res[1]] = res[3];
          last = res[1];
        }
        else if (typeof last !== "undefined") {
          headers[last] += res[2] + res[3];
        }
      }

      return headers;
    }
  }

  export class Response {
    constructor (
      public status:number,
      public headers:{[index:string]:string;} = {},
      public body:string|null = null,
      public responseURL: string|null = null
    ) {
    }
  }
}
