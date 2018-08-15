namespace app.HTTP {
  type headerList = {[index:string]: string;}

  export class Request {
    method: string;
    url: string;
    mimeType: string|null;
    timeout: number;
    headers: headerList;
    preventCache: boolean;
    private xhr: XMLHttpRequest;

    constructor (
      method: string,
      url: string,
      {
        mimeType = null,
        headers = {},
        timeout = 30000,
        preventCache = false
      }: Partial<{
        mimeType: string|null,
        headers: headerList,
        timeout: number,
        preventCache: boolean
      }> = {}
    ) {
      this.method = method;
      this.url = url;

      this.mimeType = mimeType;
      this.timeout = timeout;
      this.headers = headers;
      this.preventCache = preventCache;
    }

    send ():Promise<Response> {
      var xhr:XMLHttpRequest, url:string, key:string, val:string;

      url = this.url;

      if (this.preventCache) {
        this.headers["Pragma"] = "no-cache";
        this.headers["Cache-Control"] = "no-cache";
      }

      return new Promise( (resolve, reject) => {
        xhr = new XMLHttpRequest();

        xhr.open(this.method, url);

        if (this.mimeType !== null) {
          xhr.overrideMimeType(this.mimeType);
        }

        xhr.timeout = this.timeout;

        for ([key, val] of Object.entries(this.headers)) {
          xhr.setRequestHeader(key, val);
        }

        xhr.on("loadend", () => {
          var resonseHeaders;

          resonseHeaders = Request.parseHTTPHeader(xhr.getAllResponseHeaders());

          resolve(new Response(xhr.status, resonseHeaders, xhr.responseText, xhr.responseURL));
        });

        xhr.on("timeout", () => {
          reject("timeout");
        });

        xhr.on("abort", () => {
          reject("abort");
        });

        xhr.send();

        this.xhr = xhr;
        return
      });
    }

    abort ():void {
      this.xhr.abort();
    }

    static parseHTTPHeader (str: string):headerList {
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
      public headers:headerList = {},
      public body:string,
      public responseURL: string
    ) {
    }
  }
}
