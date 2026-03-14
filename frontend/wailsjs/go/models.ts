export namespace main {
	
	export class Account {
	    id: string;
	    name: string;
	    issuer: string;
	    secret: string;
	
	    static createFrom(source: any = {}) {
	        return new Account(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.issuer = source["issuer"];
	        this.secret = source["secret"];
	    }
	}
	export class TOTPResult {
	    code: string;
	    remaining: number;
	
	    static createFrom(source: any = {}) {
	        return new TOTPResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.code = source["code"];
	        this.remaining = source["remaining"];
	    }
	}

}

