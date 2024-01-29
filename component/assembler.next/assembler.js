function Assembler() {
    var _getFile = (_this, _target, is_file) => wfs.selectCode(wfs.path.join(_this, _target, is_file));

    function compile(mode, src, filename, asm80opts = undefined) {
        let asm80obj = asm80opts ? compileSrc(src, opts, filename) : compileSrc(src, { assembler: Z80Instr }, filename);
        if (asm80obj[0] === undefined) {
            popup.error("Internal error - " + asm80obj[0]);
        } 
        else if (asm80obj[0] === null) {
            let opcodes = asm80obj[1];
            if (mode === 0) {
                downloadBinary(filename + ".bin", returnAs.bin(opcodes[0]));
            } 
            else if (mode === 3) {
                return returnAs.bin(opcodes[0]);
            } 
            else if (mode === "debug") {
                console.log(opcodes);
            }
        } 
        else {
            popup.error(asm80obj[0].msg + "\nLine: " + asm80obj[0].s.numline);
            console.error(asm80obj);
        }
    }

    //////////////////////////////////////////////////////////////////
    // origin: https://github.com/asm80/asm80-core/blob/main/asm.js //
    //////////////////////////////////////////////////////////////////
    const compileSrc = (source, opts = { assembler: null }, _filename) => {
        opts = {
            ...opts,
            fileGet: _getFile,
            endian: false,
            ENT: null,
            BINFROM: null,
            BINTO: null,
            ENGINE: null,
            PRAGMAS: [],
            includedFiles: {},
            // endian: opts.assembler.endian,
            xref: {},
            includedFiles: {},
        };
        try {
            // parse source code into internal representation
            let parsedSource = parse(source, opts, _filename);
            console.log(parsedSource);

            // pass 1: prepare instruction codes and try to evaluate expressions
            let metacode = pass1(parsedSource, null, opts, _filename);
            console.log(metacode);

            // metacode is passed again and again until all expressions are evaluated
            for (let icnt = 0; icnt < 4; icnt++) {
                metacode = pass1(metacode[0], metacode[1], opts, _filename);
                console.log(metacode);
            }

            metacode[1]["__PRAGMAS"] = opts.PRAGMAS;

            // pass 2: assign addresses to labels and evaluate expressions
            //        (this pass is not repeated)
            // It should be all resolved aftrer the 2nd pass
            metacode = pass2(metacode, opts);
            console.log(metacode);

            return [null, metacode, opts.xref];
        } catch (e) {
            // Some error occured
            let s = e.s || "Internal error";

            // Handle different kinds of errors
            if (e.e) {
                if (typeof e.e == "object") {
                    e = e.e;
                } else {
                    e = {
                        msg: e.e,
                        s: e.s,
                    };
                }
            }

            //fix format msg vs message
            if (!e.msg && e.message) {
                e.msg = e.message;
            }

            //no message, so we use the general one
            if (!e.msg) {
                return ["Cannot evaluate line " + opts.WLINE.numline + ", there is some unspecified error (e.g. reserved world as label etc.)", null];
            }
            if (!e.s) e.s = s;

            return [e, null];
        }
    };

    ////////////////////////////////////////////////////////////////////////////////
    // origin: https://github.com/asm80/asm80-core/blob/main/expression-parser.js //
    ////////////////////////////////////////////////////////////////////////////////
    /*
        Based on ndef.parser, by Raphael Graf(r@undefined.ch)
        http://www.undefined.ch/mparser/index.html

        Ported to JavaScript and modified by Matthew Crumley (email@matthewcrumley.com, http://silentmatt.com/)

        You are free to use and modify this code in anyway you find useful. Please leave this comment in the code
        to acknowledge its original source. If you feel like it, I enjoy hearing about projects that use my code,
        but don't feel like you have to let me know or ask permission.
    */

    function object(o) {
        function F() {}
        F.prototype = o;
        return new F();
    }

    const TNUMBER = 0;
    const TOP1 = 1;
    const TOP2 = 2;
    const TVAR = 3;
    const TFUNCALL = 4;

    function Token(type_, index_, prio_, number_) {
        this.type_ = type_;
        this.index_ = index_ || 0;
        this.prio_ = prio_ || 0;
        this.number_ = number_ !== undefined && number_ !== null ? number_ : 0;
        this.toString = function () {
            switch (this.type_) {
                case TNUMBER:
                    return this.number_;
                case TOP1:
                case TOP2:
                case TVAR:
                    return this.index_;
                case TFUNCALL:
                    return "CALL";
                default:
                    return "Invalid Token";
            }
        };
    }

    function Expression(tokens, ops1, ops2, functions) {
        this.tokens = tokens;
        this.ops1 = ops1;
        this.ops2 = ops2;
        this.functions = functions;
    }

    Expression.prototype = {
        // Based on http://www.json.org/json2.js
        escapeValue: function (v) {
            let escapable = /[\\\'\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g,
                meta = {
                    // table of character substitutions
                    "\b": "\\b",
                    "\t": "\\t",
                    "\n": "\\n",
                    "\f": "\\f",
                    "\r": "\\r",
                    "'": "\\'",
                    "\\": "\\\\",
                };
            if (typeof v === "string") {
                escapable.lastIndex = 0;
                return escapable.test(v)
                    ? "'" +
                          v.replace(escapable, function (a) {
                              let c = meta[a];
                              return typeof c === "string" ? c : "\\u" + ("0000" + a.charCodeAt(0).toString(16)).slice(-4);
                          }) +
                          "'"
                    : "'" + v + "'";
            }
            return v;
        },

        simplify: function (values) {
            values = values || {};
            let nstack = [];
            let newexpression = [];
            let n1;
            let n2;
            let f;
            let L = this.tokens.length;
            let item;
            let i = 0;
            for (i = 0; i < L; i++) {
                item = this.tokens[i];
                let type_ = item.type_;
                if (type_ === TNUMBER) {
                    nstack.push(item);
                } else if (type_ === Tlet && item.index_ in values) {
                    item = new Token(TNUMBER, 0, 0, values[item.index_]);
                    nstack.push(item);
                } else if (type_ === TOP2 && nstack.length > 1) {
                    n2 = nstack.pop();
                    n1 = nstack.pop();
                    f = this.ops2[item.index_];
                    item = new Token(TNUMBER, 0, 0, f(n1.number_, n2.number_));
                    nstack.push(item);
                } else if (type_ === TOP1 && nstack.length > 0) {
                    n1 = nstack.pop();
                    f = this.ops1[item.index_];
                    item = new Token(TNUMBER, 0, 0, f(n1.number_));
                    nstack.push(item);
                } else {
                    while (nstack.length > 0) {
                        newexpression.push(nstack.shift());
                    }
                    newexpression.push(item);
                }
            }
            while (nstack.length > 0) {
                newexpression.push(nstack.shift());
            }

            return new Expression(newexpression, object(this.ops1), object(this.ops2), object(this.functions));
        },

        substitute: function (variable, expr) {
            if (!(expr instanceof Expression)) {
                expr = new Parser().parse(String(expr));
            }
            let newexpression = [];
            let L = this.tokens.length;
            let item;
            let i = 0;
            for (i = 0; i < L; i++) {
                item = this.tokens[i];
                let type_ = item.type_;
                if (type_ === Tlet && item.index_ === variable) {
                    for (let j = 0; j < expr.tokens.length; j++) {
                        let expritem = expr.tokens[j];
                        let replitem = new Token(expritem.type_, expritem.index_, expritem.prio_, expritem.number_);
                        newexpression.push(replitem);
                    }
                } else {
                    newexpression.push(item);
                }
            }

            let ret = new Expression(newexpression, object(this.ops1), object(this.ops2), object(this.functions));
            return ret;
        },

        evaluate: function (values) {
            values = values || {};
            let nstack = [];
            let n1;
            let n2;
            let f;
            let L = this.tokens.length;
            let item;
            let i = 0;
            //console.log("EVAL2", this.tokens);
            for (i = 0; i < L; i++) {
                item = this.tokens[i];
                let type_ = item.type_;
                if (type_ === TNUMBER) {
                    nstack.push(item.number_);
                } else if (type_ === TOP2) {
                    n2 = nstack.pop();
                    n1 = nstack.pop();
                    f = this.ops2[item.index_];
                    nstack.push(f(n1, n2));
                } else if (type_ === TVAR) {
                    item.index_ = item.index_.toUpperCase();
                    if (item.index_[0] === "<") {
                        if (item.index_.substr(1) in values) {
                            nstack.push(values[item.index_.substr(1)] % 256);
                        }
                    } else if (item.index_[0] === ">") {
                        if (item.index_.substr(1) in values) {
                            nstack.push(Math.floor(values[item.index_.substr(1)] / 256));
                        }
                    } else if (item.index_ in values) {
                        nstack.push(values[item.index_]);
                    } else if (item.index_ in this.functions) {
                        nstack.push(this.functions[item.index_]);
                    } else {
                        throw new Error("undefined variable: " + item.index_);
                    }
                } else if (type_ === TOP1) {
                    n1 = nstack.pop();
                    f = this.ops1[item.index_];
                    nstack.push(f(n1));
                } else if (type_ === TFUNCALL) {
                    n1 = nstack.pop();
                    f = nstack.pop();
                    if (f.apply && f.call) {
                        if (Object.prototype.toString.call(n1) == "[object Array]") {
                            nstack.push(f.apply(undefined, n1));
                        } else {
                            nstack.push(f.call(undefined, n1));
                        }
                    } else {
                        throw new Error(f + " is not a function");
                    }
                } else {
                    throw new Error("invalid Expression");
                }
            }
            if (nstack.length > 1) {
                throw new Error("invalid Expression (parity)");
            }
            let ev = nstack[0];
            let pragmas = values.__PRAGMAS;
            //console.log(pragmas)
            if (pragmas && typeof ev == "number") {
                if (pragmas.indexOf("ROUNDFLOAT") >= 0) ev = Math.round(ev);
                if (pragmas.indexOf("FLOAT") >= 0) return ev;
                if (pragmas.indexOf("NOFLOAT") >= 0) return parseInt(ev);
            }
            if (typeof ev == "number") ev = parseInt(ev);
            //console.log(nstack, this.tokens, this, values);
            return ev;
        },

        usage: function (values) {
            values = values || {};
            let xref = [];
            let nstack = [];
            let n1;
            let n2;
            let f;
            let L = this.tokens.length;
            let item;
            let i = 0;
            for (i = 0; i < L; i++) {
                item = this.tokens[i];
                let type_ = item.type_;
                if (type_ === TNUMBER) {
                    nstack.push(item.number_);
                } else if (type_ === TOP2) {
                    n2 = nstack.pop();
                    n1 = nstack.pop();
                    f = this.ops2[item.index_];
                    nstack.push(f(n1, n2));
                } else if (type_ === TVAR) {
                    item.index_ = item.index_.toUpperCase();
                    if (item.index_[0] === "<") {
                        if (item.index_.substr(1) in values) {
                            nstack.push(values[item.index_.substr(1)] % 256);
                            xref.push(item.index_.substr(1));
                        }
                    } else if (item.index_[0] === ">") {
                        if (item.index_.substr(1) in values) {
                            nstack.push(Math.floor(values[item.index_.substr(1)] / 256));
                            xref.push(item.index_.substr(1));
                        }
                    } else if (item.index_ in values) {
                        nstack.push(values[item.index_]);
                        xref.push(item.index_);
                    } else if (item.index_ in this.functions) {
                        nstack.push(this.functions[item.index_]);
                        xref.push(item.index_);
                    } else {
                        throw new Error("undefined variable: " + item.index_);
                    }
                } else if (type_ === TOP1) {
                    n1 = nstack.pop();
                    f = this.ops1[item.index_];
                    nstack.push(f(n1));
                } else if (type_ === TFUNCALL) {
                    n1 = nstack.pop();
                    f = nstack.pop();
                    if (f.apply && f.call) {
                        if (Object.prototype.toString.call(n1) == "[object Array]") {
                            nstack.push(f.apply(undefined, n1));
                        } else {
                            nstack.push(f.call(undefined, n1));
                        }
                    } else {
                        throw new Error(f + " is not a function");
                    }
                } else {
                    throw new Error("invalid Expression");
                }
            }
            if (nstack.length > 1) {
                throw new Error("invalid Expression (parity)");
            }
            return xref;
        },

        toString: function (toJS) {
            let nstack = [];
            let n1;
            let n2;
            let f;
            let L = this.tokens.length;
            let item;
            let i = 0;
            for (i = 0; i < L; i++) {
                item = this.tokens[i];
                let type_ = item.type_;
                if (type_ === TNUMBER) {
                    nstack.push(escapeValue(item.number_));
                } else if (type_ === TOP2) {
                    n2 = nstack.pop();
                    n1 = nstack.pop();
                    f = item.index_;
                    if (toJS && f == "^") {
                        nstack.push("Math.pow(" + n1 + "," + n2 + ")");
                    } else {
                        nstack.push("(" + n1 + f + n2 + ")");
                    }
                } else if (type_ === TVAR) {
                    nstack.push(item.index_);
                } else if (type_ === TOP1) {
                    n1 = nstack.pop();
                    f = item.index_;
                    if (f === "-") {
                        nstack.push("(" + f + n1 + ")");
                    } else {
                        nstack.push(f + "(" + n1 + ")");
                    }
                } else if (type_ === TFUNCALL) {
                    n1 = nstack.pop();
                    f = nstack.pop();
                    nstack.push(f + "(" + n1 + ")");
                } else {
                    throw new Error("invalid Expression");
                }
            }
            if (nstack.length > 1) {
                throw new Error("invalid Expression (parity)");
            }
            return nstack[0];
        },

        variables: function () {
            let L = this.tokens.length;
            let vars = [];
            for (let i = 0; i < L; i++) {
                let item = this.tokens[i];
                if (item.type_ === Tlet && vars.indexOf(item.index_) == -1) {
                    vars.push(item.index_);
                }
            }

            return vars;
        },

        toJSFunction: function (param, variables) {
            let f = new Function(param, "with(Parser.values) { return " + this.simplify(variables).toString(true) + "; }");
            return f;
        },
    };

    function random(a) {
        return Math.random() * (a || 1);
    }

    function fac(a) {
        //a!
        a = Math.floor(a);
        let b = a;
        while (a > 1) {
            b = b * --a;
        }
        return b;
    }

    // TODO: use hypot that doesn't overflow
    function pyt(a, b) {
        return Math.sqrt(a * a + b * b);
    }

    function near(d) {
        //let d = x[0]-x[1];
        if (d > 127) return 0;
        if (d < -128) return 0;
        return 1;
    }

    function Parser() {
        function stringCode(s) {
            let o = 0;
            for (let i = 0; i < s.length; i++) {
                o *= 256;
                o += s.charCodeAt(i);
            }
            return o;
        }

        function add(a, b) {
            if (typeof a == "string") {
                a = stringCode(a);
            }
            if (typeof b == "string") {
                b = stringCode(b);
            }
            return Number(a) + Number(b);
        }

        function fand(a, b) {
            return Number(a) & Number(b);
        }

        function fnebo(a, b) {
            return Number(a) | Number(b);
        }

        function fbequ(a, b) {
            return Number(a) == Number(b) ? 1 : 0;
        }

        function fbnequ(a, b) {
            return Number(a) == Number(b) ? 0 : 1;
        }

        function fblt(a, b) {
            return Number(a) < Number(b) ? 1 : 0;
        }

        function fbgt(a, b) {
            return Number(a) > Number(b) ? 1 : 0;
        }

        function fble(a, b) {
            return Number(a) <= Number(b) ? 1 : 0;
        }

        function fbge(a, b) {
            return Number(a) >= Number(b) ? 1 : 0;
        }

        function sub(a, b) {
            if (typeof a == "string") {
                a = stringCode(a);
            }
            if (typeof b == "string") {
                b = stringCode(b);
            }
            return Number(a) - Number(b);
        }

        function mul(a, b) {
            if (typeof a == "string") {
                let out = "";
                for (let l = 0; l < b; l++) out += a;
                return out;
            }
            return a * b;
        }

        function div(a, b) {
            return a / b;
        }

        function mod(a, b) {
            return a % b;
        }

        function concat(a, b) {
            return "" + a + b;
        }

        function neg(a) {
            return -a;
        }

        function append(a, b) {
            if (Object.prototype.toString.call(a) != "[object Array]") {
                return [a, b];
            }
            a = a.slice();
            a.push(b);
            return a;
        }

        function lsb(a) {
            return a % 256;
        }

        function msb(a) {
            return (a >> 8) & 0xff;
        }

        this.success = false;
        this.errormsg = "";
        this.expression = "";

        this.pos = 0;

        this.tokennumber = 0;
        this.tokenprio = 0;
        this.tokenindex = 0;
        this.tmpprio = 0;

        this.ops1 = {
            //"lsb": function(x){Math.floor(x%256);},
            lsb: lsb,
            msb: msb,
            sin: Math.sin,
            cos: Math.cos,
            tan: Math.tan,
            asin: Math.asin,
            acos: Math.acos,
            atan: Math.atan,
            sqrt: Math.sqrt,
            log: Math.log,
            abs: Math.abs,
            ceil: Math.ceil,
            floor: Math.floor,
            round: Math.round,
            isnear: near,
            "-": neg,
            exp: Math.exp,
        };

        this.ops2 = {
            "+": add,
            "-": sub,
            "*": mul,
            "/": div,
            "%": mod,
            "#": mod,
            "^": Math.pow,
            ",": append,
            "=": fbequ,
            "!=": fbnequ,
            "<": fblt,
            ">": fbgt,
            "<=": fble,
            ">=": fbge,
            "&": fand,
            "|": fnebo,
            "||": concat,
        };

        this.functions = {
            random: random,
            fac: fac,

            min: Math.min,
            max: Math.max,
            pyt: pyt,
            isnear: near,
            pow: Math.pow,
            atan2: Math.atan2,
        };

        this.consts = {
            //"E": Math.E,
            //"PI": Math.PI
        };
    }

    Parser.parse = function (expr) {
        return new Parser().parse(expr);
    };

    Parser.usage = function (expr, variables) {
        return Parser.parse(expr).usage(variables);
    };

    Parser.evaluate = function (expr, variables) {
        //console.log(Parser.parse(expr));
        return Parser.parse(expr).evaluate(variables);
    };

    Parser.Expression = Expression;

    Parser.values = {
        lsb: function (x) {
            Math.floor(x % 256);
        },
        msb: function (x) {
            Math.floor(x / 256);
        },
        sin: Math.sin,
        cos: Math.cos,
        tan: Math.tan,
        asin: Math.asin,
        acos: Math.acos,
        atan: Math.atan,
        sqrt: Math.sqrt,
        log: Math.log,
        abs: Math.abs,
        ceil: Math.ceil,
        floor: Math.floor,
        round: Math.round,
        random: random,
        fac: fac,
        exp: Math.exp,
        min: Math.min,
        max: Math.max,
        pyt: pyt,
        isnear: near,
        pow: Math.pow,
        atan2: Math.atan2,
        E: Math.E,
        PI: Math.PI,
    };

    Parser.prototype = {
        parse: function (expr) {
            let PRIMARY = 1 << 0;
            let OPERATOR = 1 << 1;
            let FUNCTION = 1 << 2;
            let LPAREN = 1 << 3;
            let RPAREN = 1 << 4;
            let COMMA = 1 << 5;
            let SIGN = 1 << 6;
            let CALL = 1 << 7;
            let NULLARY_CALL = 1 << 8;

            this.errormsg = "";
            this.success = true;
            let operstack = [];
            let tokenstack = [];
            this.tmpprio = 0;
            let expected = PRIMARY | LPAREN | FUNCTION | SIGN;
            let noperators = 0;
            this.expression = expr;
            this.pos = 0;

            if (!this.expression) throw new Error("Empty expression, probably missing argument");

            while (this.pos < this.expression.length) {
                if (this.isNumber()) {
                    if ((expected & PRIMARY) === 0) {
                        this.error_parsing(this.pos, "unexpected number");
                    }
                    let token = new Token(TNUMBER, 0, 0, this.tokennumber);
                    tokenstack.push(token);

                    expected = OPERATOR | RPAREN | COMMA;
                } else if (this.isOperator()) {
                    if (this.isSign() && expected & SIGN) {
                        if (this.isNegativeSign()) {
                            this.tokenprio = 2;
                            this.tokenindex = "-";
                            noperators++;
                            this.addfunc(tokenstack, operstack, TOP1);
                        }
                        expected = PRIMARY | LPAREN | FUNCTION | SIGN;
                    } else if (this.isComment()) {
                    } else {
                        if ((expected & OPERATOR) === 0) {
                            this.error_parsing(this.pos, "unexpected operator");
                        }
                        noperators += 2;
                        this.addfunc(tokenstack, operstack, TOP2);
                        expected = PRIMARY | LPAREN | FUNCTION | SIGN;
                    }
                } else if (this.isString()) {
                    if ((expected & PRIMARY) === 0) {
                        this.error_parsing(this.pos, "unexpected string");
                    }
                    let token = new Token(TNUMBER, 0, 0, this.tokennumber);
                    tokenstack.push(token);

                    expected = OPERATOR | RPAREN | COMMA;
                } else if (this.isLeftParenth()) {
                    if ((expected & LPAREN) === 0) {
                        this.error_parsing(this.pos, 'unexpected "("');
                    }

                    if (expected & CALL) {
                        noperators += 2;
                        this.tokenprio = -2;
                        this.tokenindex = -1;
                        this.addfunc(tokenstack, operstack, TFUNCALL);
                    }

                    expected = PRIMARY | LPAREN | FUNCTION | SIGN | NULLARY_CALL;
                } else if (this.isRightParenth()) {
                    if (expected & NULLARY_CALL) {
                        let token = new Token(TNUMBER, 0, 0, []);
                        tokenstack.push(token);
                    } else if ((expected & RPAREN) === 0) {
                        this.error_parsing(this.pos, 'unexpected ")"');
                    }

                    expected = OPERATOR | RPAREN | COMMA | LPAREN | CALL;
                } else if (this.isComma()) {
                    if ((expected & COMMA) === 0) {
                        this.error_parsing(this.pos, 'unexpected ","');
                    }
                    this.addfunc(tokenstack, operstack, TOP2);
                    noperators += 2;
                    expected = PRIMARY | LPAREN | FUNCTION | SIGN;
                } else if (this.isConst()) {
                    if ((expected & PRIMARY) === 0) {
                        this.error_parsing(this.pos, "unexpected constant");
                    }
                    let consttoken = new Token(TNUMBER, 0, 0, this.tokennumber);
                    tokenstack.push(consttoken);
                    expected = OPERATOR | RPAREN | COMMA;
                } else if (this.isOp2()) {
                    if ((expected & FUNCTION) === 0) {
                        this.error_parsing(this.pos, "unexpected function");
                    }
                    this.addfunc(tokenstack, operstack, TOP2);
                    noperators += 2;
                    expected = LPAREN;
                } else if (this.isOp1()) {
                    if ((expected & FUNCTION) === 0) {
                        this.error_parsing(this.pos, "unexpected function");
                    }
                    this.addfunc(tokenstack, operstack, TOP1);
                    noperators++;
                    expected = LPAREN;
                } else if (this.isVar()) {
                    if ((expected & PRIMARY) === 0) {
                        this.error_parsing(this.pos, "unexpected variable");
                    }
                    let vartoken = new Token(TVAR, this.tokenindex, 0, 0);
                    tokenstack.push(vartoken);

                    expected = OPERATOR | RPAREN | COMMA | LPAREN | CALL;
                } else if (this.isWhite()) {
                } else {
                    if (this.errormsg === "") {
                        this.error_parsing(this.pos, "unknown character in " + this.expression);
                    } else {
                        this.error_parsing(this.pos, this.errormsg);
                    }
                }
            }
            if (this.tmpprio < 0 || this.tmpprio >= 10) {
                this.error_parsing(this.pos, 'unmatched "()"');
            }
            while (operstack.length > 0) {
                let tmp = operstack.pop();
                tokenstack.push(tmp);
            }
            if (noperators + 1 !== tokenstack.length) {
                //print(noperators + 1);
                //print(tokenstack);
                this.error_parsing(this.pos, "parity");
            }

            return new Expression(tokenstack, object(this.ops1), object(this.ops2), object(this.functions));
        },

        evaluate: function (expr, variables) {
            //console.log(this.parse(expr));
            let value = this.parse(expr).evaluate(variables);
            return value;
        },

        error_parsing: function (column, msg) {
            this.success = false;
            this.errormsg = "parse error [column " + column + "]: " + msg;
            throw new Error(this.errormsg);
        },

        //\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\

        addfunc: function (tokenstack, operstack, type_) {
            let operator = new Token(type_, this.tokenindex, this.tokenprio + this.tmpprio, 0);
            while (operstack.length > 0) {
                if (operator.prio_ <= operstack[operstack.length - 1].prio_) {
                    tokenstack.push(operstack.pop());
                } else {
                    break;
                }
            }
            operstack.push(operator);
        },

        isNumber: function () {
            let r = false;
            let str = "";
            let firstok = 0;
            let firstcode = 0;
            let base = 10;
            let shouldbehex = false;
            let bakpos = this.pos;
            let strx;
            while (this.pos < this.expression.length) {
                let code = this.expression.charCodeAt(this.pos);
                //console.log(this.pos, code, firstok);
                if (firstok === 0) firstcode = code;
                if (
                    (code >= 48 && code <= 57) ||
                    code === 46 ||
                    (firstok === 0 && code === 36) || //$1123
                    (firstok === 0 && code === 37) || //%11010
                    (firstok === 1 && code === 88 && firstcode === 48) || //0X
                    (firstok === 1 && code === 120 && firstcode === 48) ||
                    (firstok > 0 && code === 72) || //...H
                    (firstok > 0 && code === 104) || //...h
                    (firstok > 0 && code === 66) || //...B
                    (firstok > 0 && code === 98) || //...b
                    (firstok > 0 && code === 81) || //...Q
                    (firstok > 0 && code === 113) || //...q
                    (firstok > 0 && code === 79) || //...O
                    (firstok > 0 && code === 111) || //...o
                    (firstok > 0 && code >= 65 && code <= 70) ||
                    (firstok > 0 && code >= 97 && code <= 102)
                ) {
                    if (((firstok > 0 && code >= 65 && code <= 70) || (firstok > 0 && code >= 97 && code <= 102)) && !(base === 16)) {
                        shouldbehex = true;
                    }

                    firstok++;
                    str += this.expression.charAt(this.pos);
                    this.pos++;

                    //num syntax fixes
                    strx = str;
                    if (str[0] === "$") {
                        strx = "0x" + str.substr(1);
                        base = 16;
                    }
                    if (str[1] === "x" || str[1] === "X") {
                        base = 16;
                    }
                    if (str[str.length - 1] === "h" || str[str.length - 1] === "H") {
                        if (base == 10 || base == 2) {
                            strx = "0x" + str.substr(0, str.length - 1);
                            base = 16;
                        }
                    }
                    if (str[str.length - 1] === "b" || str[str.length - 1] === "B") {
                        if (base == 10) {
                            strx = str.substr(0, str.length - 1);
                            base = 2;
                        }
                    }
                    if (str[str.length - 1] === "q" || str[str.length - 1] === "Q" || str[str.length - 1] === "o" || str[str.length - 1] === "O") {
                        if (base == 10) {
                            strx = str.substr(0, str.length - 1);
                            base = 8;
                        }
                    }
                    /*
                            if (str[0] === "%") {
                            console.log("OOO", str, strx)
                            if (str.length < 2) {
                                this.pos = bakpos;
                                return false;
                            }
                            strx = str.substr(1);
                            base = 2;
                            }
                */
                    if (base != 10) this.tokennumber = parseInt(strx, base);
                    else this.tokennumber = parseFloat(strx);
                    r = true;
                } else {
                    break;
                }
            }

            if (str[0] === "%") {
                //console.log("OOO", str, strx)
                if (str.length < 2) {
                    this.pos = bakpos;
                    return false;
                }
                strx = str.substr(1);
                this.tokennumber = parseInt(strx, 2);
            }

            //console.log(shouldbehex, base);
            if (shouldbehex && base === 2) {
                shouldbehex = false;
            }
            if (shouldbehex && base !== 16) {
                this.pos = bakpos;
                return false;
            }
            if (strx === "0x") {
                this.pos = bakpos;
                return false;
            }
            return r;
        },

        // Ported from the yajjl JSON parser at http://code.google.com/p/yajjl/
        unescape: function (v, pos) {
            let buffer = [];
            let escaping = false;

            for (let i = 0; i < v.length; i++) {
                let c = v.charAt(i);

                if (escaping) {
                    switch (c) {
                        case "'":
                            buffer.push("'");
                            break;
                        case "\\":
                            buffer.push("\\");
                            break;
                        case "/":
                            buffer.push("/");
                            break;
                        case "b":
                            buffer.push("\b");
                            break;
                        case "f":
                            buffer.push("\f");
                            break;
                        case "n":
                            buffer.push("\n");
                            break;
                        case "r":
                            buffer.push("\r");
                            break;
                        case "t":
                            buffer.push("\t");
                            break;
                        case "u":
                            // interpret the following 4 characters as the hex of the unicode code point
                            let codePoint = parseInt(v.substring(i + 1, i + 5), 16);
                            buffer.push(String.fromCharCode(codePoint));
                            i += 4;
                            break;
                        default:
                            throw this.error_parsing(pos + i, "Illegal escape sequence: '\\" + c + "'");
                    }
                    escaping = false;
                } else {
                    if (c == "\\") {
                        escaping = true;
                    } else {
                        buffer.push(c);
                    }
                }
            }

            return buffer.join("");
        },

        isString: function () {
            let r = false;
            let str = "";
            let startpos = this.pos;
            if ((this.pos < this.expression.length && this.expression.charAt(this.pos) == "'") || this.expression.charAt(this.pos) == '"') {
                let delim = this.expression.charAt(this.pos);
                this.pos++;
                while (this.pos < this.expression.length) {
                    let code = this.expression.charAt(this.pos);
                    if (code != delim || str.slice(-1) == "\\") {
                        str += this.expression.charAt(this.pos);
                        this.pos++;
                    } else {
                        this.pos++;
                        this.tokennumber = this.unescape(str, startpos);
                        r = true;
                        break;
                    }
                }
            }
            return r;
        },

        isConst: function () {
            return false; //false positive on E, PI
            let str;
            for (let i in this.consts) {
                if (true) {
                    let L = i.length;
                    str = this.expression.substr(this.pos, L);
                    if (i === str) {
                        this.tokennumber = this.consts[i];
                        this.pos += L;
                        return true;
                    }
                }
            }
            return false;
        },

        isOperator: function () {
            let code = this.expression.charCodeAt(this.pos);
            if (code === 43) {
                // +
                this.tokenprio = 0;
                this.tokenindex = "+";
            } else if (code === 45) {
                // -
                this.tokenprio = 0;
                this.tokenindex = "-";
            } else if (code === 124) {
                // |
                if (this.expression.charCodeAt(this.pos + 1) === 124) {
                    this.pos++;
                    this.tokenprio = 0;
                    this.tokenindex = "||";
                } else {
                    //return false;
                    this.tokenprio = 5;
                    this.tokenindex = "|";
                }
            } else if (code === 42) {
                // *
                this.tokenprio = 1;
                this.tokenindex = "*";
            } else if (code === 47) {
                // /
                this.tokenprio = 2;
                this.tokenindex = "/";
            } else if (code === 37) {
                // %
                this.tokenprio = 2;
                this.tokenindex = "%";
            } else if (code === 35) {
                // #
                this.tokenprio = 2;
                this.tokenindex = "#";
            } else if (code === 94) {
                // ^
                this.tokenprio = 3;
                this.tokenindex = "^";
            } else if (code === 38) {
                // &
                this.tokenprio = 4;
                this.tokenindex = "&";
            } else if (code === 61) {
                // =
                this.tokenprio = -1;
                this.tokenindex = "=";
            } else if (code === 33) {
                // !
                if (this.expression.charCodeAt(this.pos + 1) === 61) {
                    this.pos++;
                    this.tokenprio = -1;
                    this.tokenindex = "!=";
                } else {
                    //return false;
                    this.tokenprio = 5;
                    this.tokenindex = "!";
                }
            } else if (code === 63) {
                // ?
                if (this.expression.charCodeAt(this.pos + 1) === 60) {
                    // <
                    this.pos++;
                    if (this.expression.charCodeAt(this.pos + 1) === 61) {
                        this.pos++;
                        this.tokenprio = -1;
                        this.tokenindex = "<=";
                    } else {
                        this.tokenprio = -1;
                        this.tokenindex = "<";
                    }
                }
                if (this.expression.charCodeAt(this.pos + 1) === 62) {
                    // >
                    this.pos++;
                    if (this.expression.charCodeAt(this.pos + 1) === 61) {
                        this.pos++;
                        this.tokenprio = -1;
                        this.tokenindex = ">=";
                    } else {
                        this.tokenprio = -1;
                        this.tokenindex = ">";
                    }
                }
            } else {
                /*
            else if (code === 60) { // <
                if (this.expression.charCodeAt(this.pos + 1) === 61) {
                this.pos++;
                this.tokenprio = -1;
                this.tokenindex = "<=";
                }
                else {
                this.tokenprio = -1;
                this.tokenindex = "<";
                }
            }
            */
                return false;
            }
            this.pos++;
            return true;
        },

        isSign: function () {
            let code = this.expression.charCodeAt(this.pos - 1);
            if (code === 45 || code === 43) {
                // -
                return true;
            }
            return false;
        },

        isPositiveSign: function () {
            let code = this.expression.charCodeAt(this.pos - 1);
            if (code === 43) {
                // -
                return true;
            }
            return false;
        },

        isNegativeSign: function () {
            let code = this.expression.charCodeAt(this.pos - 1);
            if (code === 45) {
                // -
                return true;
            }
            return false;
        },

        isLeftParenth: function () {
            let code = this.expression.charCodeAt(this.pos);
            if (code === 40) {
                // (
                this.pos++;
                this.tmpprio += 10;
                return true;
            }
            return false;
        },

        isRightParenth: function () {
            let code = this.expression.charCodeAt(this.pos);
            if (code === 41) {
                // )
                this.pos++;
                this.tmpprio -= 10;
                return true;
            }
            return false;
        },

        isComma: function () {
            let code = this.expression.charCodeAt(this.pos);
            if (code === 44) {
                // ,
                this.pos++;
                this.tokenprio = -1;
                this.tokenindex = ",";
                return true;
            }
            return false;
        },

        isWhite: function () {
            let code = this.expression.charCodeAt(this.pos);
            if (code === 32 || code === 9 || code === 10 || code === 13) {
                this.pos++;
                return true;
            }
            return false;
        },

        isOp1: function () {
            let str = "";
            for (let i = this.pos; i < this.expression.length; i++) {
                let c = this.expression.charAt(i);
                if (c.toUpperCase() === c.toLowerCase()) {
                    if (i === this.pos || (c != "_" && (c < "0" || c > "9"))) {
                        break;
                    }
                }
                str += c;
            }
            if (str.length > 0 && str in this.ops1) {
                this.tokenindex = str;
                this.tokenprio = 5;
                this.pos += str.length;
                return true;
            }
            return false;
        },

        isOp2: function () {
            let str = "";
            for (let i = this.pos; i < this.expression.length; i++) {
                let c = this.expression.charAt(i);
                if (c.toUpperCase() === c.toLowerCase()) {
                    if (i === this.pos || (c != "_" && (c < "0" || c > "9"))) {
                        break;
                    }
                }
                str += c;
            }
            if (str.length > 0 && str in this.ops2) {
                this.tokenindex = str;
                this.tokenprio = 5;
                this.pos += str.length;
                return true;
            }
            return false;
        },

        isVar: function () {
            let str = "";
            for (let i = this.pos; i < this.expression.length; i++) {
                let c = this.expression.charAt(i);
                if (c === "$") {
                    str = "_PC";
                    break;
                }
                if (c.toUpperCase() === c.toLowerCase() && c !== "<" && c !== ">") {
                    if (i === this.pos || (c != "_" && (c < "0" || c > "9"))) {
                        break;
                    }
                }
                str += c;
            }
            if (str.length > 0) {
                this.tokenindex = str;
                this.tokenprio = 4;
                if (str !== "_PC") {
                    this.pos += str.length;
                } else {
                    this.pos++;
                }
                return true;
            }
            return false;
        },

        isComment: function () {
            let code = this.expression.charCodeAt(this.pos - 1);
            if (code === 47 && this.expression.charCodeAt(this.pos) === 42) {
                this.pos = this.expression.indexOf("*/", this.pos) + 2;
                if (this.pos === 1) {
                    this.pos = this.expression.length;
                }
                return true;
            }
            return false;
        },
    };

    const returnAs = {
        bin: function (ia) {
            let a = [];
            for (var c = 0; c < ia.length; c++) {
                let t = ia[c];
                let adr = t.addr;
                if (t.lens) {
                    for (let ic = 0; ic < t.lens.length; ic++) {
                        a[adr++] = t.lens[ic]; // 设置数组元素
                    }
                }
            }
            // console.log(a.slice(ORGPC)[0]);
            // console.log(a);
            if (ORGPC) {
                _PC = ORGPC[0];
                ORGPC = [];
                return a.slice(_PC);
            } else {
                return a;
            }
        },

        ///////////////////////////////////////////////////////////////////////
        // origin: https://github.com/asm80/asm80-core/blob/main/beautify.js //
        ///////////////////////////////////////////////////////////////////////
        emptymask: function (xs) {
            xs.map((lx) => {
                let l = lx.line;
                let lx2 = {
                    addr: 0,
                    line: ";;;EMPTYLINE",
                    numline: lx.numline,
                };
                while (l[0] == " ") {
                    l = l.substr(1);
                }
                return l.length ? lx : lx2;
            });
        },

        beautify: function (s, opts, filename) {
            let i = toInternal(s.split(/\n/));
            i = emptymask(i);
            i = nonempty(i);
            i = norm(i);
            let prei = prepro(
                i,
                {
                    noinclude: true,
                    ...opts,
                },
                (filename = filename),
            );
            i = i.map((line) => {
                //console.log(line);
                line.line = line.line.replace(/\%\%M/gi, "__m");
                return parseLine(line, prei[1], opts);
            });
            let out = "";
            let op, ln;
            for (let q = 0; q < i.length; q++) {
                op = i[q];
                ln = "";
                if (op.remark == "EMPTYLINE") {
                    out += "\n";
                    continue;
                }

                if (!op.label && !op.opcode && op.remark) {
                    out += ";" + op.remark + "\n";
                    continue;
                }

                if (op.label) {
                    ln += op.label;
                    if (op.opcode != "EQU" && op.opcode != "=" && op.opcode != ".SET") ln += ":";
                    ln += " ";
                }
                while (ln.length < 12) {
                    ln += " ";
                }
                if (op.opcode) {
                    ln += op.opcode + " ";
                }
                while (ln.length < 20) {
                    ln += " ";
                }
                if (op.params) {
                    ln += op.params + " ";
                }
                if (op.remark) {
                    ln += ";" + op.remark;
                }
                ln = ln.replace(/__m/gi, "%%M");
                out += ln + "\n";
            }
            return out;
        },

        //////////////////////////////////////////////////////////////////////
        // origin: https://github.com/asm80/asm80-core/blob/main/listing.js //
        //////////////////////////////////////////////////////////////////////
        lst: function (V, vars, raw, compact = false, opts) {
            let ln;
            let op;
            let out = "";
            for (let i = 0, j = V.length; i < j; i++) {
                op = V[i];
                //console.log(op)
                ln = "";
                //if (op.ifskip) {continue}
                if (op.macro && !raw) {
                    /*out += '        **MACRO UNROLL - '+op.macro+'\n';*/
                }
                if (op.addr !== undefined && !op.ifskip) {
                    ln += toHex4(op.addr);
                    if (op.phase) {
                        ln += " @" + toHex4(op.addr - op.phase);
                    }
                    ln += compact ? " " : "   ";
                }
                if (op.lens && !op.ifskip) {
                    for (let n = 0; n < op.lens.length; n++) {
                        ln += toHex2(op.lens[n]) + " ";
                    }
                }

                if (!compact)
                    while (ln.length < 20) {
                        ln += " ";
                    }
                if (compact)
                    while (ln.length < 15) {
                        ln += " ";
                    }
                if (op.listing) {
                    out += ln + op.listing + "\n";
                    continue;
                }
                if (op.label) {
                    ln += op.label + ":   ";
                }
                if (!compact)
                    while (ln.length < 30) {
                        ln += " ";
                    }
                if (compact)
                    while (ln.length < 22) {
                        ln += " ";
                    }
                if (op.opcode) {
                    ln += op.opcode + (compact ? " " : "   ");
                }
                if (op.bandPar) {
                    ln += op.bandPar + ",";
                }
                if (op.aimPar) {
                    ln += op.aimPar + ",";
                }
                if (op.params) {
                    ln += op.params + (compact ? " " : "   ");
                }
                if (op.remark) {
                    ln += ";" + op.remark;
                }
                out += ln + "\n";
            }
            if (raw) return out;
            /*
            out+="\n\n";
            for (let k in vars) {
            if (vars[k]===null) continue;
            if (k[0]=='_' && k[1]=='_') continue;
            if (k[k.length-1]==='$') continue;
            ln = '';
            ln += k;
            while (ln.length<12) {ln+= ' ';}
            ln += toHex4(vars[k]);
            out += ln+"\n";
            }
        */
            //xref
            out += "\n\n";
            let xref = opts.xref;
            for (let k in xref) {
                if (xref[k] === null) continue;
                if (k[0] == "_" && k[1] == "_") continue;
                if (k[k.length - 1] === "$") continue;
                ln = "";
                ln += k + ": ";
                while (ln.length < 20) {
                    ln += " ";
                }
                ln += toHex4(xref[k].value);
                ln += " DEFINED AT LINE " + xref[k].defined.line;
                if (xref[k].defined.file != "*main*") ln += " IN " + xref[k].defined.file;
                out += ln + "\n";
                if (xref[k].usage) {
                    for (let j = 0; j < xref[k].usage.length; j++) {
                        out += "                    > USED AT LINE " + xref[k].usage[j].line;
                        if (xref[k].usage[j].file != "*main*") out += " IN " + xref[k].usage[j].file;
                        out += "\n";
                    }
                }
            }
            return out;
        },

        html: function (V, vars, raw, compact = false) {
            let parfix = (par) => {
                par += "";
                for (let k in vars) {
                    if (vars[k] === null) continue;
                    if (k[0] == "_" && k[1] == "_") continue;
                    if (k[k.length - 1] === "$") continue;
                    let re = new RegExp("^" + k + "$", "i");
                    if (par.match(re)) {
                        return '<a href="#LBL' + k + '">' + par + "</a>";
                    }
                }
                return par;
            };
            let ln;
            let op;
            let out = "<html><head><meta charset=utf-8><body><table>";
            for (let i = 0, j = V.length; i < j; i++) {
                op = V[i];
                ln = '<tr id="ln' + op.numline + '">';
                if (op.macro && !raw) {
                    /*ln += '        **MACRO UNROLL - '+op.macro+'\n';*/
                }
                if (op.addr !== undefined) {
                    ln += '<td><a name="ADDR' + toHex4(op.addr) + '">' + toHex4(op.addr) + "</a>";
                    if (op.phase) {
                        ln += "</td><td>" + toHex4(op.addr - op.phase);
                    } else ln += "</td><td>";
                    ln += "</td>";
                } else ln += "<td></td><td></td>";
                if (op.lens) {
                    ln += "<td>";
                    for (let n = 0; n < op.lens.length; n++) {
                        ln += toHex2(op.lens[n]) + " ";
                    }
                    ln += "</td>";
                } else ln += "<td></td>";

                if (op.label) {
                    ln += '<td><a name="LBL' + op.label + '">' + op.label + "</a></td>";
                } else ln += "<td></td>";
                if (op.opcode) {
                    ln += "<td>" + op.opcode + "</td>";
                } else ln += "<td></td>";
                if (op.params) {
                    ln += "<td>" + op.params.map(parfix) + "</td>";
                } else ln += "<td></td>";
                if (op.remark) {
                    ln += "<td>" + ";" + op.remark + "</td>";
                } else ln += "<td></td>";
                out += ln + "</tr>\n";
            }
            out += "</table>";
            return out;
        },
    };

    ////////////////////////////////////////////////////////////////////////
    // origin: https://github.com/asm80/asm80-core/blob/main/parseLine.js //
    ////////////////////////////////////////////////////////////////////////
    const includedLineNumber = (s) => {
        if (!s.includedFile) return s.numline;
        return s.includedFileAtLine + "__" + s.numline;
    };

    const parseLine = (s, macros, opts = { stopFlag: null, olds: null, assembler: null }) => {
        let t = s.line;
        let ll;

        //anonymous labels
        //format: : label
        ll = t.match(/^\s*:\s*(.*)/);
        if (ll) {
            s.anonymousLabel = "anon__" + includedLineNumber(s);
            t = ll[1];
        }

        //console.log(s, ll)
        //labels
        //format: label:
        ll = t.match(/^\s*(\@{0,1}[a-zA-Z0-9-_]+):\s*(.*)/);
        //console.log(t, ll)
        if (ll) {
            s.label = ll[1].toUpperCase();
            t = ll[2];
        }

        //anonymous labels
        //format: : label

        ll = t.match(/^\s*:\s*(.*)/);
        //console.log(s, ll)
        if (ll) {
            s.label = "__@anon" + s.numline;
            t = ll[2];
        }

        s._dp = 0;
        s.params = [];

        //special EQU format as "label = value"
        let oo = t.match(/^\s*(\=)\s*(.*)/);
        if (oo) {
            s.opcode = oo[1].toUpperCase();
            t = oo[2];
        } else {
            oo = t.match(/^\s*([\.a-zA-Z0-9-_]+)\s*(.*)/);
            //console.log("2",oo,t)
            if (oo) {
                s.opcode = oo[1].toUpperCase();
                t = oo[2];
            }
        }
        /*
        oo = t.match(/^\s*(:\=)\s*(.*)/);
        if (oo) {
          s.opcode = "=";
          t = oo[2];
        }
    */
        if (t) {
            //param grouping by {}
            //try {
            //console.log(t)
            while (t.match(/\"(.*?)\"/g)) {
                t = t.replace(/\"(.*?)\"/g, (n) => "00ss" + btoax(n) + "!");
            }

            while (t.match(/\'(.*?)\'/g)) {
                //console.log(t)
                t = t.replace(/\'(.*?)\'/g, (n) => "00ss" + btoax('"' + n.substr(1, n.length - 2) + '"') + "!");
            }

            while (t.match(/\{(.*?)\}/g)) {
                t = t.replace(/\{(.*?)\}/g, (n) => "00bb" + btoax(n.substr(1, n.length - 2)));
            }
            //} catch(e) {
            // console.log(e,t)
            //}
            //semicolon fix
            while (t.match(/"(.*?);(.*?)"/g)) {
                t = t.replace(/"(.*?);(.*?)"/g, '"$1§$2"');
            }
            while (t.match(/'(.*?);(.*?)'/g)) {
                t = t.replace(/'(.*?);(.*?)'/g, '"$1§$2"');
            }

            let pp = t.match(/^\s*([^;]*)(.*)/);
            if (pp && pp[1].length) {
                s.paramstring = pp[1];

                //sane strings
                let ppc = pp[1];
                while (ppc.match(/"(.*?),(.*?)"/g)) {
                    ppc = ppc.replace(/"(.*?),(.*?)"/g, '"$1€$2"');
                }
                while (ppc.match(/'(.*?),(.*?)'/g)) {
                    ppc = ppc.replace(/'(.*?),(.*?)'/g, '"$1€$2"');
                }

                let n = ppc.match(/([0-9]+)\s*DUP\s*\((.*)\)/i);
                if (n) {
                    let dup = parseInt(n[1]);
                    let nln = "";
                    for (let i = 0; i < dup; i++) {
                        nln += n[2] + ",";
                    }
                    ppc = nln.substring(0, nln.length - 1);
                    //console.log(ppc);
                }

                let px = ppc.split(/\s*,\s*/);
                s.params = px.map((ppc) => {
                    let p = ppc.replace(/€/g, ",").replace(/§/g, ";").trim();
                    p = p.replace(/00ss(.*?)\!/g, (n) => atobx(n.substr(4, n.length - 5)));
                    return p;
                });

                //console.log(s)
                t = pp[2].replace(/§/g, ";");
            }
        }

        //console.log("SSS",s)
        if (t) {
            let rr = t.match(/^\s*;*(.*)/);
            if (rr) {
                s.remark = rr[1].replace(/00ss(.*?)\!/g, (n) => atobx(n.substr(4, n.length - 5)));
                if (!s.remark) {
                    s.remark = " ";
                }
                t = "";
            }
        }
        s.notparsed = t;

        //pokus s opts
        //console.log("ZDECH", s)
        if (s.opcode === "ORG") {
            s.opcode = ".ORG";
        }
        if (s.opcode === ".ERROR") {
            s.paramstring = s.paramstring.replace(/00ss(.*?)\!/g, (n) => atobx(n.substr(4, n.length - 5)));
            return s;
            //console.log(stopFlag,olds,vars)
            //throw { "msg": s.paramstring.replace(/00ss(.*?)\!/g, function (n) { return atobx(n.substr(4, n.length - 5)) }), "s":s};
        }
        if (s.opcode === ".EQU") {
            s.opcode = "EQU";
        }
        if (s.opcode === ".FILL") {
            s.opcode = "FILL";
        }
        if (s.opcode === ".ORG") {
            return s;

            // obsolete - evaluate origin has been suppressed
            /*
          try {
            //				s.addr = Parser.evaluate(s.paramstring);
            return s;
          } catch (e) {
            throw {
              msg: e.msg,
              s: s
            };
          }
          */
        }

        if (s.opcode === "DEFB") {
            s.opcode = "DB";
            return s;
        }
        if (s.opcode === ".BYTE") {
            s.opcode = "DB";
            return s;
        }
        if (s.opcode === ".DB") {
            s.opcode = "DB";
            return s;
        }
        if (s.opcode === ".WORD") {
            s.opcode = "DW";
            return s;
        }
        if (s.opcode === ".DW") {
            s.opcode = "DW";
            return s;
        }
        if (s.opcode === "DEFW") {
            s.opcode = "DW";
            return s;
        }
        if (s.opcode === ".DD") {
            s.opcode = "DD";
            return s;
        }
        if (s.opcode === ".DF") {
            s.opcode = "DF";
            return s;
        }
        if (s.opcode === ".DFZXS") {
            s.opcode = "DFZXS";
            return s;
        }
        if (s.opcode === ".DFF") {
            s.opcode = "DFF";
            return s;
        }
        if (s.opcode === "DEFS") {
            s.opcode = "DS";
            return s;
        }
        if (s.opcode === ".RES") {
            s.opcode = "DS";
            return s;
        }
        if (s.opcode === "DEFM") {
            s.opcode = "DS";
            return s;
        }

        if (s.opcode === ".ALIGN") {
            s.opcode = "ALIGN";
            return s;
        }

        if (s.opcode === ".IFN") {
            s.opcode = "IFN";
            return s;
        }

        if (s.opcode === ".IF") {
            s.opcode = "IF";
            return s;
        }

        if (s.opcode === ".ELSE") {
            s.opcode = "ELSE";
            return s;
        }
        if (s.opcode === ".ENDIF") {
            s.opcode = "ENDIF";
            return s;
        }

        if (s.opcode === ".PRAGMA") {
            opts.PRAGMAS = opts.PRAGMAS || [];
            opts.PRAGMAS.push(s.params[0].toUpperCase());
            return s;
        }

        if (
            s.opcode === "EQU" ||
            s.opcode === "=" ||
            s.opcode === ".SET" ||
            s.opcode === "IF" ||
            s.opcode === "IFN" ||
            s.opcode === "ELSE" ||
            s.opcode === "ENDIF" ||
            s.opcode === ".ERROR" ||
            s.opcode === ".INCLUDE" ||
            s.opcode === ".INCBIN" ||
            s.opcode === ".MACRO" ||
            s.opcode === ".ENDM" ||
            s.opcode === ".BLOCK" ||
            s.opcode === ".ENDBLOCK" ||
            s.opcode === ".REPT" ||
            s.opcode === ".CPU" ||
            s.opcode === ".ENT" ||
            s.opcode === ".BINFROM" ||
            s.opcode === ".BINTO" ||
            s.opcode === ".ENGINE" ||
            s.opcode === ".PRAGMA" ||
            s.opcode === "END" ||
            s.opcode === ".END" ||
            //6809 assembler ops
            s.opcode === "BSZ" ||
            s.opcode === "FCB" ||
            s.opcode === "FCC" ||
            s.opcode === "FDB" ||
            s.opcode === "FILL" ||
            s.opcode === "RMB" ||
            s.opcode === "ZMB" ||
            s.opcode === "SETDP" ||
            //65816
            s.opcode === ".M8" ||
            s.opcode === ".X8" ||
            s.opcode === ".M16" ||
            s.opcode === ".X16" ||
            //phase, dephase
            s.opcode === ".PHASE" ||
            s.opcode === ".DEPHASE" ||
            s.opcode === ".SETPHASE" ||
            s.opcode === "ALIGN" ||
            s.opcode === ".CSTR" ||
            s.opcode === ".ISTR" ||
            s.opcode === ".PSTR" ||
            //segments
            s.opcode === ".CSEG" ||
            s.opcode === ".DSEG" ||
            s.opcode === ".ESEG" ||
            s.opcode === ".BSSEG" ||
            s.opcode === "DB" ||
            s.opcode === "DW" ||
            s.opcode === "DD" ||
            s.opcode === "DF" ||
            s.opcode === "DFF" ||
            s.opcode === "DFZXS" ||
            s.opcode === "DS"
        ) {
            return s;
        }

        if (s.opcode === ".DEBUGINFO" || s.opcode === ".MACPACK" || s.opcode === ".FEATURE" || s.opcode === ".ZEROPAGE" || s.opcode === ".SEGMENT" || s.opcode === ".SETCPU") {
            s.opcode = "";
            return s;
        }

        if (!s.opcode && s.label) {
            return s;
        }
        let ax = null;
        try {
            ax = opts.assembler.parseOpcode(s, {}, Parser);
        } catch (e) {
            throw {
                msg: e,
                s: s,
            };
        }
        //console.log("SS",JSON.stringify(s),ax)
        if (ax !== null) return ax;

        if (macros[s.opcode]) {
            s.macro = s.opcode;
            return s;
        }

        //label bez dvojtecky
        //console.log(s,s2)
        if (!s.label && !opts.stopFlag) {
            //console.log(s)
            //let s2 = {line:s.line,numline:s.numline, addr:null,bytes:0};
            let s2 = JSON.parse(JSON.stringify(s));
            s2.addr = null;
            s2.bytes = 0;

            if (s.remark && !s.opcode) {
                return s;
            }
            if (!s.params || s.params.length === 0)
                throw {
                    msg: "Unrecognized instruction " + s.opcode,
                    s: s,
                };
            if (!s.opcode)
                throw {
                    msg: "Unrecognized instruction " + s.opcode,
                    s: s,
                };
            //hotfix
            //console.log(s)
            if (s.params[0].indexOf(":=") === 0) s.params[0] = ".SET" + s.params[0].substr(2);
            s2.line = s.opcode + ": " + s.params.join();
            if (s.remark) s2.line += " ;" + s.remark;
            //console.log("ATTEMPT2",s2.line)
            let sx = parseLine(s2, macros, {
                stopFlag: true,
                olds: s,
                ...opts,
            });
            if (!sx.opcode)
                throw {
                    msg: "Unrecognized instruction " + s.opcode,
                    s: s,
                };
            return sx;
        }
        if (opts.stopFlag)
            throw {
                msg: "Unrecognized instruction " + opts.olds.opcode,
                s: s,
            };
        throw {
            msg: "Unrecognized instruction " + s.opcode,
            s: s,
        };
    };

    /////////////////////////////////////////////////////////////////////
    // origin: https://github.com/asm80/asm80-core/blob/main/parser.js //
    /////////////////////////////////////////////////////////////////////
    // assembler file parser
    // gets a text file, returns an array of parsed lines
    function parse(s, opts, _filename) {
        // split and convert to internal lines
        let i = toInternal(s.split(/\n/));
        //remove empty lines
        i = nonempty(i);
        //normalize lines
        i = norm(i);

        //macro processing and expansion

        let prei = prepro(i, opts, null, _filename);
        //console.log(prei)
        i = prei[0].map((line) => parseLine(line, prei[1], opts));
        i = unroll(i, prei[1], null, opts);

        //console.log("prei",i)
        return i;
    }

    ////////////////////////////////////////////////////////////////////
    // origin: https://github.com/asm80/asm80-core/blob/main/pass1.js //
    ////////////////////////////////////////////////////////////////////
    var ORGPC = [];

    const pass1 = (V, vxs, opts, filename) => {
        if (!opts.xref) opts.xref = {};
        let segment = "CSEG";
        let segallow = () => {
            if (segment === "BSSEG") throw { msg: op.opcode + " is not allowed in BSSEG" };
        };
        let seg = {};
        let PC = 0;
        let vars = {};
        if (vxs) vars = vxs;
        let op = null;
        let m, l;
        let ifskip = 0;
        let cond;
        let doif = 0;
        let ifstack = [];
        let blocks = [];
        let phase = 0;
        let DP = 0;
        //let anon = []

        //main loop - for each line
        for (let i = 0, j = V.length; i < j; i++) {
            op = V[i];
            opts.WLINE = V[i];
            op.pass = 1;
            op.segment = segment;
            op.addr = PC;
            op._dp = DP;
            vars._PC = PC;
            if (phase !== 0) {
                op.phase = phase;
            }

            if (op.opcode === "ENDIF") {
                if (!doif)
                    throw {
                        msg: "ENDIF without IF",
                        s: op,
                    };
                ifskip = ifstack.pop();
                if (ifstack.length) {
                    doif = 1;
                } else {
                    doif = 0;
                    ifskip = 0;
                }
                continue;
            }

            if (op.opcode === "ELSE") {
                if (!doif)
                    throw {
                        msg: "ELSE without IF",
                        s: op,
                    };
                ifskip = ifstack.pop();
                ifskip = ifskip ? 0 : 1;
                //console.log("ELS",ifstack,ifskip,ifstack.filter(function(q){return q==1}))
                if (ifstack.filter((q) => q == 1).length) {
                    ifskip = 1;
                }
                ifstack.push(ifskip);
                continue;
            }
            //console.log(doif,ifskip,op,ifstack)
            if (op.opcode === "IF") {
                if (doif) {
                    //throw {msg: "Nested IFs are not supported",s:op};
                    //if (ifskip) continue;
                }

                //throw {msg: "Nested IFs are not supported",s:op};
                try {
                    cond = Parser.evaluate(op.params[0], vars);

                    //console.log("IF C",cond,ifskip,op.params[0], vars)
                } catch (e) {
                    /*throw {msg: "IF condition can not be determined",s:op}*/
                }
                if (!cond) ifskip = 1;
                doif = 1;
                ifstack.push(ifskip);
                //console.error("LIF",ifstack,ifskip,doif,op.params[0])
                continue;
            }

            if (op.opcode === "IFN") {
                //if (doif) throw {msg: "Nested IFs are not supported",s:op};
                try {
                    cond = Parser.evaluate(op.params[0], vars);
                } catch (e) {
                    /*throw {msg: "IF condition can not be determined",s:op}*/
                }
                if (cond) ifskip = 1;
                //console.log("IFN C",cond,ifskip,op.params[0], vars)
                doif = 1;
                ifstack.push(ifskip);
                continue;
            }

            if (ifskip) {
                op.ifskip = true;
                continue;
            }

            if (op.opcode === ".BLOCK") {
                if (!op.includedFileAtLine) blocks.push(op.numline);
                else blocks.push(op.numline + "@" + op.includedFileAtLine);
                //console.log("bl!", blocks);
                let prefix = blocks.join("/");
                //vars['__blocks'] = JSON.stringify(blocks);
                vars["__" + prefix] = [];

                continue;
            }
            if (op.opcode === ".ENDBLOCK") {
                let redef = vars["__" + blocks.join("/")];
                //console.log(redef, vars);
                for (let nn = 0; nn < redef.length; nn++) {
                    vars[redef[nn]] = vars[blocks.join("/") + "/" + redef[nn]];
                    //console.log("REDEF",redef[nn], vars[redef[nn]])
                    //vars[blocks.join("/")+"/"+redef[nn]] = null;
                    delete vars[blocks.join("/") + "/" + redef[nn]];
                }
                blocks.pop();
                vars["__blocks"] = JSON.stringify(blocks);

                continue;
            }
            /*
                if (op.anonymousLabel) {
                  console.log(op);
                  anon.push(op)
                }
          */
            if (op.label) {
                //console.log("LABEL", op.label, op.opcode)
                let varname = op.label;
                let beGlobal = false;
                if (varname[0] === "@") {
                    beGlobal = true;
                    varname = varname.substr(1);
                    op.label = varname;
                    op.beGlobal = true;
                }

                if (op.beGlobal) beGlobal = true;

                if (blocks.length > 0) {
                    varname = blocks.join("/") + "/" + varname;
                    vars["__" + blocks.join("/")].push(op.label);
                }

                //console.log(varname, blocks)
                //console.log(op.label,beGlobal,vars[op.label]!==undefined, vars, vxs);
                if (!vxs) {
                    if (typeof vars[varname + "$"] !== "undefined" || (beGlobal && vars[op.label] !== undefined)) {
                        if (op.opcode !== ".SET" && op.opcode !== ":=") {
                            throw {
                                msg: "Redefine label " + op.label + " at line " + op.numline,
                                s: op,
                            };
                        }
                    }
                }
                if (vars[op.label]) {
                    vars[varname] = vars[op.label];
                } else {
                    if (beGlobal) {
                        vars[varname] = PC;
                    }
                }
                //console.log("XVARS", vars)
                //console.log(op);
                opts.xref[op.label] = {
                    defined: {
                        line: op.numline,
                        file: op.includedFile || "*main*",
                    },
                    value: PC,
                };
                vars[varname + "$"] = PC;
                //console.log(op.label,vars[op.label],PC, vars)
                vars[op.label] = PC;
                //if (isNaN(PC)) throw {msg:"PC NaN",s:op}
                if (beGlobal) vars[varname] = PC;
            }

            //console.log(PC,op)
            try {
                if (op.opcode === ".ORG") {
                    PC = Parser.evaluate(op.params[0], vars);
                    op.addr = PC;
                    seg[segment] = PC;
                    ORGPC.push(PC);
                    continue;
                }

                if (op.opcode === ".CSEG") {
                    seg[segment] = PC;
                    segment = "CSEG";
                    op.segment = segment;
                    PC = seg[segment] || 0;
                    op.addr = PC;
                }
                if (op.opcode === ".DSEG") {
                    seg[segment] = PC;
                    segment = "DSEG";
                    op.segment = segment;
                    PC = seg[segment] || 0;
                    op.addr = PC;
                }
                if (op.opcode === ".ESEG") {
                    seg[segment] = PC;
                    segment = "ESEG";
                    op.segment = segment;
                    PC = seg[segment] || 0;
                    op.addr = PC;
                }
                if (op.opcode === ".BSSEG") {
                    seg[segment] = PC;
                    segment = "BSSEG";
                    op.segment = segment;
                    PC = seg[segment] || 0;
                    op.addr = PC;
                }

                if (op.opcode === ".PHASE") {
                    if (phase)
                        throw {
                            msg: "PHASE cannot be nested",
                        };
                    let newphase = Parser.evaluate(op.params[0], vars);
                    op.addr = PC;
                    phase = newphase - PC;
                    PC = newphase;
                    continue;
                }
                if (op.opcode === ".DEPHASE") {
                    op.addr = PC;
                    PC = PC - phase;
                    phase = 0;
                    continue;
                }
                if (op.opcode === "EQU") {
                    //TADY JESTE NEMUSI BYT OK!!!
                    try {
                        vars[op.label] = Parser.evaluate(op.params[0], vars);
                    } catch (e) {
                        vars[op.label] = null;
                        //console.log('Unsatisfied '+op.label);
                    }
                    opts.xref[op.label] = {
                        defined: {
                            line: op.numline,
                            file: op.includedFile || "*main*",
                        },
                        value: vars[op.label],
                    };
                    continue;
                }
                if (op.opcode === "=" || op.opcode === ":=" || op.opcode === ".SET") {
                    //console.log(op)
                    //changeble assign
                    vars[op.label] = Parser.evaluate(op.params[0], vars);
                    opts.xref[op.label] = {
                        defined: {
                            line: op.numline,
                            file: op.includedFile || "*main*",
                        },
                        value: vars[op.label],
                    };
                    continue;
                }
            } catch (e) {
                throw {
                    msg: e.msg,
                    s: op,
                };
            }

            if (op.opcode === "DB" || op.opcode === "FCB") {
                segallow();
                op.bytes = 0;
                for (l = 0; l < op.params.length; l++) {
                    try {
                        m = Parser.evaluate(op.params[l], vars);
                        if (typeof m === "number") {
                            op.bytes++;
                            continue;
                        }
                        if (typeof m === "string") {
                            op.bytes += m.length;
                            continue;
                        }
                    } catch (e) {
                        op.bytes++;
                    }
                }
            }

            if (op.opcode === "FCC") {
                segallow();
                op.bytes = 0;
                //console.log(op)
                for (l = 0; l < op.params.length; l++) {
                    let mystring = op.params[l].trim();
                    let delim = mystring[0];
                    if (mystring[mystring.length - 1] !== delim)
                        throw {
                            msg: "Delimiters does not match",
                            s: op,
                        };
                    op.bytes += mystring.length - 2;
                }
            }

            if (op.opcode === ".CSTR" || op.opcode === ".PSTR" || op.opcode === ".ISTR") {
                segallow();
                op.bytes = 0;
                for (l = 0; l < op.params.length; l++) {
                    try {
                        m = Parser.evaluate(op.params[l], vars);
                        if (typeof m === "number") {
                            op.bytes++;
                            continue;
                        }
                        if (typeof m === "string") {
                            op.bytes += m.length;
                            continue;
                        }
                    } catch (e) {
                        op.bytes++;
                    }
                }
                if (op.opcode === ".CSTR" || op.opcode === ".PSTR") op.bytes++; //+1 for leading count / trailing zero
            }

            if (op.opcode === "DS" || op.opcode === "RMB") {
                //op.bytes = Parser.evaluate(op.params[0]);
                let bytes = Parser.evaluate(op.params[0], vars);
                //console.log(bytes, typeof bytes)
                if (typeof bytes !== "number")
                    throw {
                        msg: "DS / RMB needs a numerical parameter",
                        s: op,
                    };
                if (op.params.length == 2) {
                    //DB alias
                    let m = Parser.evaluate(op.params[1], vars);
                    if (typeof m === "string") m = m.charCodeAt(0);
                    op.bytes = bytes;
                    op.lens = [];
                    for (let iq = 0; iq < bytes; iq++) {
                        op.lens[iq] = m;
                    }
                    //console.log(op.lens);
                }
                PC = PC + bytes;

                continue;
            }
            if (op.opcode === "ALIGN") {
                //op.bytes = Parser.evaluate(op.params[0]);
                let align = Parser.evaluate(op.params[0], vars);

                PC = PC + (PC % align > 0 ? align - (PC % align) : 0);

                continue;
            }
            if (op.opcode === "SETDP") {
                //op.bytes = Parser.evaluate(op.params[0]);
                DP = Parser.evaluate(op.params[0], vars);

                continue;
            }
            if (op.opcode === "FILL") {
                segallow();
                //op.bytes = Parser.evaluate(op.params[0]);
                let bytes = Parser.evaluate(op.params[1], vars);
                //console.log("FILLB",bytes,op.params)
                //DB alias
                let m = Parser.evaluate(op.params[0], vars);
                if (typeof m === "string") m = m.charCodeAt(0);
                op.bytes = bytes;
                op.lens = [];
                for (let iq = 0; iq < bytes; iq++) {
                    op.lens[iq] = m;
                }
                //console.log(op.lens);
                PC = PC + bytes;

                continue;
            }
            if (op.opcode === "BSZ" || op.opcode === "ZMB") {
                segallow();
                //op.bytes = Parser.evaluate(op.params[0]);
                let bytes = Parser.evaluate(op.params[0], vars);
                op.bytes = bytes;
                op.lens = [];
                for (let iq = 0; iq < bytes; iq++) {
                    op.lens[iq] = 0;
                }
                PC = PC + bytes;

                continue;
            }
            if (op.opcode === "DW" || op.opcode === "FDB") {
                segallow();
                op.bytes = 0;
                for (l = 0; l < op.params.length; l++) {
                    try {
                        m = Parser.evaluate(op.params[l], vars);
                        if (typeof m === "number") {
                            op.bytes += 2;
                            continue;
                        }
                    } catch (e) {
                        op.bytes += 2;
                    }
                }
            }

            if (op.opcode === "DD" || op.opcode === "DF") {
                segallow();
                op.bytes = 0;
                for (l = 0; l < op.params.length; l++) {
                    try {
                        m = Parser.evaluate(op.params[l], vars);
                        if (typeof m === "number") {
                            op.bytes += 4;
                            continue;
                        }
                    } catch (e) {
                        op.bytes += 4;
                    }
                }
            }
            if (op.opcode === "DFF") {
                segallow();
                op.bytes = 0;
                for (l = 0; l < op.params.length; l++) {
                    try {
                        m = Parser.evaluate(op.params[l], vars);
                        if (typeof m === "number") {
                            op.bytes += 8;
                            continue;
                        }
                    } catch (e) {
                        op.bytes += 8;
                    }
                }
            }
            if (op.opcode === "DFZXS") {
                segallow();
                op.bytes = 0;
                for (l = 0; l < op.params.length; l++) {
                    try {
                        m = Parser.evaluate(op.params[l], vars);
                        if (typeof m === "number") {
                            op.bytes += 5;
                            continue;
                        }
                    } catch (e) {
                        op.bytes += 5;
                    }
                }
            }

            if (op.opcode === ".INCBIN") {
                segallow();
                if (!op.params[0])
                    throw {
                        msg: "No file name given at line " + op.numline,
                        s: op,
                    };
                //console.log("Include "+params[0]);
                let nf = opts.fileGet(filename, op.params[0], true);
                if (!nf)
                    throw {
                        msg: "Cannot find file " + op.params[0] + " for incbin",
                        s: op,
                    };

                op.bytes = 0;
                op.lens = [];
                for (let iq = 0; iq < nf.length; iq++) {
                    let cd = nf.charCodeAt(iq);
                    if (cd > 255) {
                        op.lens[op.bytes++] = cd >> 8;
                    }
                    op.lens[op.bytes++] = cd % 256;
                }
                //console.log(op.lens);
                PC = PC + op.bytes;

                continue;
            }

            //65816
            if (op.opcode === ".M16") {
                vars.__AX = 16;
                continue;
            }
            if (op.opcode === ".M8") {
                vars.__AX = 8;
                continue;
            }
            if (op.opcode === ".X16") {
                vars.__MX = 16;
                continue;
            }
            if (op.opcode === ".X8") {
                vars.__MX = 8;
                continue;
            }

            //je to instrukce? Jde optimalizovat?
            let opa = opts.assembler.parseOpcode(V[i], vars, Parser);
            if (opa) {
                segallow();
                //console.log(op,opa);
                op = opa;
            }

            if (op.bytes === undefined) op.bytes = 0;
            //console.log(op.bytes,op)
            PC += op.bytes;
            if (op.params && op.params.length && !op.opcode) {
                throw {
                    msg: "No opcode, possible missing",
                    s: op,
                };
            }
        }

        return [V, vars];
    };

    ////////////////////////////////////////////////////////////////////
    // origin: https://github.com/asm80/asm80-core/blob/main/pass2.js //
    ////////////////////////////////////////////////////////////////////
    const pass2 = (vx, opts) => {
        const charVar8 = (dta) => {
            if (opts.PRAGMAS.RELAX) {
                if (typeof dta == "string") {
                    return dta.charCodeAt(0) & 0xff;
                } else {
                    return dta & 0xff;
                }
            } else {
                //strict
                if (typeof dta == "string") {
                    if (dta.length != 1) throw "String parameter too long (" + dta + ")";
                    return dta.charCodeAt(0) & 0xff;
                } else {
                    if (dta > 255) throw "Param out of bound (" + dta + ")";
                    if (dta < -128) throw "Param out of bound (" + dta + ")";
                    return dta & 0xff;
                }
            }
        };
        const charVar16 = (dta) => {
            if (typeof dta == "string") {
                return dta.charCodeAt(0) & 0xff;
            } else {
                return dta & 0xff;
            }
        };

        const nextAnon = (V, i) => {
            console.log("AnonNext", i);
        };

        let V = vx[0];
        let vars = vx[1];
        //		console.log(vars);
        let op = null,
            dta = null,
            m,
            bts,
            l;
        let blocks = [];
        let ifskip = 0;
        let cond;
        let doif = 0;

        for (let i = 0, j = V.length; i < j; i++) {
            try {
                op = V[i];
                op.pass = 2;

                if (op.opcode === "ENDIF") {
                    ifskip = 0;
                    continue;
                }

                if (op.opcode === "ELSE") {
                    ifskip = ifskip ? 0 : 1;
                    continue;
                }

                if (ifskip) {
                    continue;
                }

                if (op.opcode === ".ERROR") {
                    //console.log("ERROR", op)
                    throw {
                        msg: op.paramstring,
                        s: op,
                    };
                    //continue;
                }

                if (op.opcode === "IF") {
                    Parser.evaluate(op.params[0], vars);
                    try {
                        cond = Parser.evaluate(op.params[0], vars);
                        //console.log("IF", op.params, cond)
                        if (!cond) ifskip = 1;
                    } catch (e) {
                        //console.log("CATCH",e)
                        throw {
                            msg: "IF condition mismatched",
                        };
                        ifskip = 1;
                    }
                    continue;
                }
                if (op.opcode === "IFN") {
                    try {
                        cond = Parser.evaluate(op.params[0], vars);
                        if (cond) ifskip = 1;
                    } catch (e) {
                        throw {
                            msg: "IF condition mismatched",
                        };
                    }
                    continue;
                }

                vars._PC = op.addr;
                //console.log(vars._PC,op);
                try {
                    let usage = Parser.usage(op.params[0].toUpperCase(), vars);
                    for (let u = 0; u < usage.length; u++) {
                        if (!opts.xref[usage[u]].usage) opts.xref[usage[u]].usage = [];
                        opts.xref[usage[u]].usage.push({
                            line: op.numline,
                            file: op.includedFile || "*main*",
                        });
                    }
                } catch (e) {}
                try {
                    let usage = Parser.usage(op.params[1].toUpperCase(), vars);
                    for (let u = 0; u < usage.length; u++) {
                        if (!opts.xref[usage[u]].usage) opts.xref[usage[u]].usage = [];
                        opts.xref[usage[u]].usage.push({
                            line: op.numline,
                            file: op.includedFile || "*main*",
                        });
                    }
                } catch (e) {}

                if (op.opcode === ".BLOCK") {
                    //blocks.push(op.numline);
                    if (!op.includedFileAtLine) blocks.push(op.numline);
                    else blocks.push(op.numline + "@" + op.includedFileAtLine);
                    let redef = vars["__" + blocks.join("/")];
                    for (let nn = 0; nn < redef.length; nn++) {
                        vars[blocks.join("/") + "/" + redef[nn]] = vars[redef[nn]];
                        vars[redef[nn]] = vars[blocks.join("/") + "/" + redef[nn] + "$"];
                    }
                    continue;
                }
                if (op.opcode === ".ENDBLOCK") {
                    let redef = vars["__" + blocks.join("/")];
                    for (let nn = 0; nn < redef.length; nn++) {
                        vars[redef[nn]] = vars[blocks.join("/") + "/" + redef[nn]];
                        if (vars[redef[nn]] === undefined) delete vars[redef[nn]];
                        vars[blocks.join("/") + "/" + redef[nn]] = null;
                    }
                    blocks.pop();
                    //console.log(vars);
                    continue;
                }

                if (op.opcode === ".ENT") {
                    opts.ENT = Parser.evaluate(op.params[0], vars);
                    continue;
                }

                if (op.opcode === ".BINFROM") {
                    opts.BINFROM = Parser.evaluate(op.params[0], vars);
                    continue;
                }

                if (op.opcode === ".BINTO") {
                    opts.BINTO = Parser.evaluate(op.params[0], vars);
                    continue;
                }

                if (op.opcode === ".SETPHASE") {
                    if (!opts.PHASES) opts.PHASES = {};
                    opts.PHASES[op.addr] = op.params[0];
                    continue;
                }

                if (op.opcode === ".ENGINE") {
                    opts.ENGINE = op.params[0];
                    continue;
                }

                // if (op.opcode === ".PRAGMA") {
                //     opts.PRAGMAS=opts.PRAGMAS || [];
                //     opts.PRAGMAS.push(op.params[0].toUpperCase());
                //     continue;
                // }

                if (op.opcode === "EQU") {
                    //console.log(op.label);
                    if (!op.label)
                        throw {
                            msg: "EQU without label",
                            s: op,
                        };
                    vars[op.label] = Parser.evaluate(op.params[0], vars);
                    continue;
                }

                if (op.opcode === ".SET" || op.opcode === ":=") {
                    //console.log(op.label, op.params[0], vars);
                    vars[op.label] = Parser.evaluate(op.params[0], vars);
                    continue;
                }

                if (op.opcode === "DB" || op.opcode === "FCB") {
                    bts = 0;
                    op.lens = [];
                    for (l = 0; l < op.params.length; l++) {
                        m = Parser.evaluate(op.params[l], vars);
                        if (typeof m === "number") {
                            op.lens[bts++] = Math.floor(m % 256);
                            continue;
                        }
                        if (typeof m === "string") {
                            for (let mm = 0; mm < m.length; mm++) {
                                op.lens[bts++] = m.charCodeAt(mm);
                            }
                            continue;
                        }
                    }
                    continue;
                }

                if (op.opcode === "FCC") {
                    bts = 0;
                    op.lens = [];
                    for (l = 0; l < op.params.length; l++) {
                        let mystring = op.params[l].trim();
                        let delim = mystring[0];
                        let m = mystring.substr(1, mystring.length - 2);
                        for (let mm = 0; mm < m.length; mm++) {
                            op.lens[bts++] = m.charCodeAt(mm);
                        }
                    }
                    continue;
                }

                if (op.opcode === ".CSTR") {
                    bts = 0;
                    op.lens = [];
                    for (l = 0; l < op.params.length; l++) {
                        m = Parser.evaluate(op.params[l], vars);
                        if (typeof m === "number") {
                            op.lens[bts++] = Math.floor(m % 256);
                            continue;
                        }
                        if (typeof m === "string") {
                            for (let mm = 0; mm < m.length; mm++) {
                                op.lens[bts++] = m.charCodeAt(mm);
                            }
                            continue;
                        }
                    }
                    op.lens[bts++] = 0;
                    continue;
                }

                if (op.opcode === ".PSTR") {
                    bts = 1;
                    op.lens = [];
                    for (l = 0; l < op.params.length; l++) {
                        m = Parser.evaluate(op.params[l], vars);
                        if (typeof m === "number") {
                            op.lens[bts++] = Math.floor(m % 256);
                            continue;
                        }
                        if (typeof m === "string") {
                            for (let mm = 0; mm < m.length; mm++) {
                                op.lens[bts++] = m.charCodeAt(mm);
                            }
                            continue;
                        }
                    }
                    op.lens[0] = bts - 1;
                    continue;
                }

                if (op.opcode === ".ISTR") {
                    bts = 0;
                    op.lens = [];
                    for (l = 0; l < op.params.length; l++) {
                        m = Parser.evaluate(op.params[l], vars);
                        if (typeof m === "number") {
                            op.lens[bts++] = Math.floor(m % 128);
                            continue;
                        }
                        if (typeof m === "string") {
                            for (let mm = 0; mm < m.length; mm++) {
                                op.lens[bts++] = m.charCodeAt(mm) & 0x7f;
                            }
                            continue;
                        }
                    }
                    op.lens[bts - 1] = op.lens[bts - 1] | 0x80;
                    continue;
                }

                if (op.opcode === "DW" || op.opcode === "FDB") {
                    bts = 0;
                    op.lens = [];
                    for (l = 0; l < op.params.length; l++) {
                        m = Parser.evaluate(op.params[l], vars);
                        if (typeof m === "number") {
                            if (opts.endian) {
                                op.lens[bts++] = Math.floor(m / 256);
                                op.lens[bts++] = Math.floor(m % 256);
                            } else {
                                op.lens[bts++] = Math.floor(m % 256);
                                op.lens[bts++] = Math.floor(m / 256);
                            }
                            continue;
                        }
                    }
                    continue;
                }

                if (op.opcode === "DD") {
                    //console.error("DD")
                    bts = 0;
                    op.lens = [];
                    for (l = 0; l < op.params.length; l++) {
                        m = Parser.evaluate(op.params[l], vars);
                        if (typeof m === "number") {
                            //console.error(m)
                            let b = new ArrayBuffer(4);
                            let c = new Int32Array(b);
                            c[0] = m;
                            let a = new Uint8Array(b);
                            if (opts.endian) {
                                op.lens[bts++] = a[3];
                                op.lens[bts++] = a[2];
                                op.lens[bts++] = a[1];
                                op.lens[bts++] = a[0];
                            } else {
                                op.lens[bts++] = a[0];
                                op.lens[bts++] = a[1];
                                op.lens[bts++] = a[2];
                                op.lens[bts++] = a[3];
                            }
                            continue;
                        }
                    }
                    continue;
                }

                if (op.opcode === "DF") {
                    //console.error("DD")
                    bts = 0;
                    op.lens = [];
                    for (l = 0; l < op.params.length; l++) {
                        m = Parser.evaluate(op.params[l], vars);
                        if (typeof m === "number") {
                            //console.error(m)
                            let b = new ArrayBuffer(4);
                            let c = new Float32Array(b);
                            c[0] = m;
                            let a = new Uint8Array(b);
                            if (opts.endian) {
                                op.lens[bts++] = a[3];
                                op.lens[bts++] = a[2];
                                op.lens[bts++] = a[1];
                                op.lens[bts++] = a[0];
                            } else {
                                op.lens[bts++] = a[0];
                                op.lens[bts++] = a[1];
                                op.lens[bts++] = a[2];
                                op.lens[bts++] = a[3];
                            }
                            continue;
                        }
                    }
                    continue;
                }
                if (op.opcode === "DFF") {
                    //console.error("DD")
                    bts = 0;
                    op.lens = [];
                    for (l = 0; l < op.params.length; l++) {
                        m = Parser.evaluate(op.params[l], vars);
                        if (typeof m === "number") {
                            //console.error(m)
                            let b = new ArrayBuffer(8);
                            let c = new Float64Array(b);
                            c[0] = m;
                            let a = new Uint8Array(b);
                            if (opts.endian) {
                                op.lens[bts++] = a[7];
                                op.lens[bts++] = a[6];
                                op.lens[bts++] = a[5];
                                op.lens[bts++] = a[4];
                                op.lens[bts++] = a[3];
                                op.lens[bts++] = a[2];
                                op.lens[bts++] = a[1];
                                op.lens[bts++] = a[0];
                            } else {
                                op.lens[bts++] = a[0];
                                op.lens[bts++] = a[1];
                                op.lens[bts++] = a[2];
                                op.lens[bts++] = a[3];
                                op.lens[bts++] = a[4];
                                op.lens[bts++] = a[5];
                                op.lens[bts++] = a[6];
                                op.lens[bts++] = a[7];
                            }
                            continue;
                        }
                    }
                    continue;
                }

                if (op.opcode === "DFZXS") {
                    //console.error("DD")
                    bts = 0;
                    op.lens = [];
                    for (l = 0; l < op.params.length; l++) {
                        m = Parser.evaluate(op.params[l], vars);
                        if (typeof m === "number") {
                            //console.error(m)
                            let a = fptozx(m, false);
                            //console.log(m,a)
                            if (opts.endian) {
                                op.lens[bts++] = a[4];
                                op.lens[bts++] = a[3];
                                op.lens[bts++] = a[2];
                                op.lens[bts++] = a[1];
                                op.lens[bts++] = a[0];
                            } else {
                                op.lens[bts++] = a[0];
                                op.lens[bts++] = a[1];
                                op.lens[bts++] = a[2];
                                op.lens[bts++] = a[3];
                                op.lens[bts++] = a[4];
                            }
                            continue;
                        }
                    }
                    continue;
                }

                // if (op.opcode === "DS") {
                //     console.log(op);
                // }

                // Tady se děje magie s instrukcí
                if (op.anonymousLabel) {
                    //console.log(op);
                    vars["ANON_PREV_2"] = ["ANON_PREV_1"];
                    vars["ANON_PREV_1"] = op.addr;
                    //console.log(vars);
                }

                if (op.lens && op.lens[1] && typeof op.lens[1] === "function") {
                    if (op.lens[2] === "addr24") {
                        //3 bytes - 65816 modes
                        dta = op.lens[1](vars);
                        if (opts.endian) {
                            op.lens[3] = Math.floor(dta % 256);
                            op.lens[2] = Math.floor((dta >> 8) % 256);
                            op.lens[1] = Math.floor((dta >> 16) & 0xff);
                        } else {
                            op.lens[1] = Math.floor(dta % 256);
                            op.lens[2] = Math.floor((dta >> 8) % 256);
                            op.lens[3] = Math.floor((dta >> 16) & 0xff);
                        }
                    } else if (op.lens[2] === "addr32") {
                        //3 bytes - 65816 modes
                        dta = op.lens[1](vars);
                        if (opts.endian) {
                            op.lens[4] = Math.floor(dta % 256);
                            op.lens[3] = Math.floor((dta >> 8) % 256);
                            op.lens[2] = Math.floor((dta >> 16) & 0xff);
                            op.lens[1] = Math.floor((dta >> 24) & 0xff);
                        } else {
                            op.lens[1] = Math.floor(dta % 256);
                            op.lens[2] = Math.floor((dta >> 8) % 256);
                            op.lens[3] = Math.floor((dta >> 16) & 0xff);
                            op.lens[4] = Math.floor((dta >> 24) & 0xff);
                        }
                    } else if (op.lens[2] === null) {
                        //2 bytes
                        dta = op.lens[1](vars);
                        if (typeof dta == "string") {
                            if (opts.endian) {
                                op.lens[1] = dta.charCodeAt(0) & 0xff;
                                op.lens[2] = dta.charCodeAt(1) & 0xff;
                            } else {
                                op.lens[2] = dta.charCodeAt(0) & 0xff;
                                op.lens[1] = dta.charCodeAt(1) & 0xff;
                            }
                        } else {
                            if (opts.endian) {
                                op.lens[2] = Math.floor(dta % 256);
                                op.lens[1] = Math.floor(dta / 256);
                            } else {
                                op.lens[1] = Math.floor(dta % 256);
                                op.lens[2] = Math.floor(dta / 256);
                            }
                        }
                    } else {
                        dta = op.lens[1](vars);
                        op.lens[1] = charVar8(dta);
                    }
                }
                if (op.lens && op.lens.length > 2 && typeof op.lens[2] == "function") {
                    //				console.log("OPLENS3",op.lens[3], op.lens[2]);
                    dta = op.lens[2](vars);
                    if (op.lens[3] === null) {
                        dta = op.lens[2](vars);
                        if (typeof dta == "string") {
                            if (opts.endian) {
                                op.lens[2] = dta.charCodeAt(0) & 0xff;
                                op.lens[3] = dta.charCodeAt(1) & 0xff;
                            } else {
                                op.lens[3] = dta.charCodeAt(0) & 0xff;
                                op.lens[2] = dta.charCodeAt(1) & 0xff;
                            }
                        } else {
                            if (opts.endian) {
                                op.lens[3] = dta & 0xff;
                                op.lens[2] = dta >> 8;
                            } else {
                                op.lens[2] = dta & 0xff;
                                op.lens[3] = dta >> 8;
                            }
                        }
                    } else {
                        op.lens[2] = charVar8(dta);
                    }
                }

                if (op.lens && op.lens.length > 3 && typeof op.lens[3] == "function") {
                    dta = op.lens[3](vars);
                    if (op.lens[4] === null) {
                        dta = op.lens[3](vars);
                        if (typeof dta == "string") {
                            if (opts.endian) {
                                op.lens[3] = dta.charCodeAt(0) & 0xff;
                                op.lens[4] = dta.charCodeAt(1) & 0xff;
                            } else {
                                op.lens[4] = dta.charCodeAt(0) & 0xff;
                                op.lens[3] = dta.charCodeAt(1) & 0xff;
                            }
                        } else {
                            if (opts.endian) {
                                op.lens[4] = dta & 0xff;
                                op.lens[3] = dta >> 8;
                            } else {
                                op.lens[3] = dta & 0xff;
                                op.lens[4] = dta >> 8;
                            }
                        }
                    } else {
                        op.lens[3] = charVar8(dta);
                    }

                    //				op.lens[3] = charVar8(op.lens[3](vars)) & 0xff;
                }

                if (op.lens && op.lens.length > 1) {
                    if (typeof op.lens[1] == "string") {
                        op.lens[1] = op.lens[1].charCodeAt(0);
                    }
                    if (isNaN(op.lens[1])) {
                        //console.log(1201,op)
                        throw {
                            msg: "param out of bounds, NaN",
                        };
                    }
                    if ((op.lens[1] > 255 || op.lens[1] < -128) && op.lens.length == 2) {
                        throw {
                            msg: "param out of bounds - " + op.lens[1],
                        };
                    }
                    if (op.lens[1] < 0) {
                        op.lens[1] = 256 + op.lens[1];
                    }
                }

                //console.log(op.lens,op)
                //xref usage
            } catch (e) {
                throw {
                    msg: e.msg,
                    s: op,
                    e: e,
                };
            }
        }

        return [V, vars];
    };

    ///////////////////////////////////////////////////////////////////////////
    // origin: https://github.com/asm80/asm80-core/blob/main/preprocessor.js //
    ///////////////////////////////////////////////////////////////////////////
    const macroParams = (d, params = [], uniq, pars, qnumline) => {
        let out = {
            line: d.line,
            addr: d.addr,
            macro: d.macro,
            numline: d.numline,
        };
        uniq = uniq + "S" + qnumline;
        //console.log(uniq, d, params, uniq, pars, qnumline);
        let xpars = pars;
        if (xpars && xpars.length > params.length) {
            out.numline = qnumline;
            throw {
                msg: "Too few parameters for macro unrolling",
                s: out,
            };
        }

        for (let i = params.length - 1; i >= 0; i--) {
            let par = params[i];
            if (par.indexOf("00bb") === 0) {
                par = atobx(par.substr(4));
            }
            //console.log(d, params,uniq,pars)
            out.line = out.line.replace("%%" + (i + 1), par);
            if (xpars && xpars[i]) {
                out.line = out.line.replace(xpars[i], par);
            }
        }
        out.line = out.line.replace("%%M", "M_" + uniq);
        out.line = out.line.replace("%%m", "M_" + uniq);
        return out;
    };

    const findBlock = (ni, block, opts) => {
        if (!block) return ni;
        let out = [];
        let f = null;
        for (let i = 0; i < ni.length; i++) {
            let l = ni[i];
            let p = parseLine(l, {}, opts);
            if (f) out.push(l);
            //if (!l.opcode) continue;
            if (p.opcode == ".ENDBLOCK") {
                if (f) {
                    return out;
                }
            } else if (p.opcode == ".BLOCK") {
                if (f) return out;
                if (p.params[0].toUpperCase() == block.toUpperCase()) {
                    out.push(l);
                    f = true;
                }
            }
        }
        throw {
            msg: "Cannot find block " + block + " in included file",
        };
    };

    const prepro = (V, opts = {}, fullfile, filename) => {
        if (!opts.includedFiles) opts.includedFiles = {};
        let op,
            ln,
            paramstring = null,
            px,
            params = null;
        let macros = {};
        // let macroPars = {};
        let macroDefine = null;
        let reptCount = null;
        let out = [];
        let outi = 0;
        for (let i = 0, j = V.length; i < j; i++) {
            op = V[i].line;
            let remark = op.match(/\s*(.)/);
            if (remark && remark[1] === ";") {
                out.push(V[i]);
                continue;
            }

            ln = op.match(/\s*(\.[^\s]+)(.*)/);

            if (!ln) {
                if (macroDefine) {
                    macros[macroDefine].push(V[i]);
                    //console.log(V[i])
                    //out.push({remark:";"+V[i].line});
                    continue;
                } else {
                    out.push(V[i]);
                }
                continue;
            }
            //console.log(op,ln)
            let opcode = ln[1].toUpperCase();
            let pp = ln[2].match(/^\s*([^;]*)(.*)/);
            if (pp && pp[1].length) {
                paramstring = pp[1];
                px = pp[1].split(/\s*,\s*/);
                params = px.map((q) => q.trim());
            } else {
                params = null;
            }

            if (opcode === ".INCLUDE" && opts.noinclude) continue;
            if (opcode === ".INCLUDE") {
                //block selective include
                let block = "";
                if (!params || !params[0])
                    throw {
                        msg: "No file name given",
                        s: V[i],
                    };
                if (params[0].indexOf(":") >= 0) {
                    let px = params[0].split(":");
                    params[0] = px[0];
                    block = px[1];
                    if (px.length == 3) {
                        block = px[2];
                    } else {
                        //only 2 pars.
                        //console.log(ln,px,px[0],block)
                        if (opts.includedFiles["*" + px[0].toUpperCase() + ":" + block.toUpperCase()]) {
                            //ignore multiple partials
                            continue;
                        }
                    }
                    opts.includedFiles["*" + px[0].toUpperCase() + ":" + block.toUpperCase()] = "used";
                }

                let ni;
                let fullni;
                let nf;

                if (params[0].toUpperCase() == "THIS" && block) {
                    //console.log(fullfile);
                    ni = findBlock(fullfile, block, opts);
                    //console.log(tni)
                } else {
                    //if (includedFiles[params[0].replace(/\"/g,"")]) throw {"msg":"File "+params[0].replace(/\"/g,"")+" is already included elsewhere - maybe recursion","s":V[i]};
                    //console.log("Include "+params[0]);
                    nf = opts.fileGet(filename, params[0].replace(/\"/g, ""), true);
                    if (!nf)
                        throw {
                            msg: "File " + params[0] + " not found",
                            s: V[i],
                        };
                    //console.log(nf);
                    ni = toInternal(nf.split(/\n/));
                    ni = nonempty(ni);
                    ni = norm(ni);
                    //console.log(ni)
                    fullni = ni;
                    ni = findBlock(ni, block, opts);
                }

                //console.log(ni)
                let preni = prepro(ni, {}, fullni, nf);
                for (let k = 0; k < preni[0].length; k++) {
                    preni[0][k].includedFile = params[0].replace(/\"/g, "");
                    preni[0][k].includedFileAtLine = V[i].numline;
                    out.push(preni[0][k]);
                }
                for (k in preni[1]) {
                    macros[k] = preni[1][k];
                }
                //console.log(params[0].replace(/\"/g,""));
                opts.includedFiles[params[0].replace(/\"/g, "")] = nf;
                continue;
            }

            if (opcode === ".ENDM") {
                //console.log("endm")
                if (!macroDefine) {
                    throw {
                        msg: "ENDM without MACRO at line " + V[i].numline,
                        s: V[i],
                    };
                }
                if (reptCount) {
                    //je to REPT makro, co ted?
                    out.push({
                        numline: V[i].numline,
                        line: ";rept unroll",
                        addr: null,
                        bytes: 0,
                        remark: "REPT unroll",
                    });
                    for (let ii = 0; ii < reptCount; ii++) {
                        for (let jj = 0; jj < macros[macroDefine].length; jj++) {
                            let macline = macros[macroDefine][jj].line;
                            out.push({
                                numline: V[ii].numline,
                                line: macline,
                                addr: null,
                                bytes: 0,
                            });
                        }
                    }
                } else {
                    let pars = macros[macroDefine][0] || [];
                    out.push({
                        numline: V[i].numline,
                        line: ";Macro define " + macroDefine,
                        addr: null,
                        bytes: 0,
                        listing: ".macro " + macroDefine + (pars ? "," : "") + pars.join(","),
                    });
                    let md = macros[macroDefine];
                    //console.log(md)
                    for (let k = 0; k < md.length; k++) {
                        if (!md[k]) continue;
                        out.push({
                            line: ";",
                            listing: md[k].line,
                        });
                    }
                    out.push({
                        line: ";",
                        listing: ".endm",
                    });
                    out.push({
                        line: ";",
                        listing: " ",
                    });
                }
                macroDefine = null;
                reptCount = null;
                continue;
            }

            if (opcode === ".MACRO") {
                //console.log("endms",params,ln,op);
                if (op[0] === ";") continue;
                let macroName = null;
                let test = op.match(/^(\S+)\s+\.MACRO/i);
                //console.log(params,test)
                if (test) {
                    macroName = test[1];
                } else {
                    if (params && params[0]) macroName = params.shift();
                }

                if (!macroName)
                    throw {
                        msg: "Bad macro name at line " + V[i].numline,
                        s: V[i],
                    };
                if (macroName[macroName.length - 1] === ":") macroName = macroName.substr(0, macroName.length - 1);

                macroDefine = macroName.toUpperCase();
                if (macros[macroDefine])
                    throw {
                        msg: "Macro " + macroDefine + " redefinition at line " + V[i].numline,
                        s: V[i],
                    };
                macros[macroDefine] = [params];
                //macroPars[macroDefine] = params;
                continue;
            }

            if (opcode === ".REPT") {
                if (!params || !params[0])
                    throw {
                        msg: "No repeat count given",
                        s: V[i],
                    };
                reptCount = Parser.evaluate(params[0]);
                if (!reptCount || reptCount < 1)
                    throw {
                        msg: "Bad repeat count given",
                        s: V[i],
                    };
                macroDefine = "*REPT" + V[i].numline;
                if (macros[macroDefine])
                    throw {
                        msg: "Macro redefinition at line " + V[i].numline,
                        s: V[i],
                    };
                macros[macroDefine] = [];
                continue;
            }

            if (macroDefine) {
                macros[macroDefine].push(V[i]);
                continue;
            }
            out.push(V[i]);
        }
        if (macroDefine) {
            throw {
                msg: "MACRO " + macroDefine + " has no appropriate ENDM",
                //s: V[i],
            };
        }
        //console.log(macros)
        return [out, macros];
    };

    const unroll = (V, macros, uniqseed, opts) => {
        if (!uniqseed) uniqseed = "";
        let out = [];
        for (let i = 0; i < V.length; i++) {
            let s = V[i];
            if (!s) console.log("V", V, i);
            if (!s.macro) {
                out.push(s);
                continue;
            }
            let m = macros[s.macro];
            let pars = m[0];

            //console.log(s,pars)
            out.push({
                remark: "*Macro unroll: " + s.line,
            });
            //console.log(macros);
            for (let j = 0; j < m.length; j++) {
                if (j === 0) continue;
                let preline = macroParams(m[j], s.params, i + uniqseed, pars, s.numline);
                preline.bytes = 0;
                //console.log("PL",preline)
                let ng = parseLine(preline, macros, {
                    assembler: opts.assembler,
                });

                if (ng.macro) {
                    //nested unroll
                    //console.log("NG",ng);
                    //console.log("nest", ng, i, j);
                    let nest = unroll([ng], macros, uniqseed + "_" + i, opts);
                    //console.log(nest)
                    for (let k = 0; k < nest.length; k++) {
                        out.push(nest[k]);
                    }
                    continue;
                }
                if (s.label) ng.label = s.label;
                s.label = "";
                ng.remark = s.remark;
                ng.macro = s.macro;
                s.macro = null;
                s.remark = "";
                out.push(ng);
            }
        }
        //console.log(out);
        return out;
    };

    //////////////////////////////////////////////////////////////////////
    // origin: https://github.com/asm80/asm80-core/blob/main/cpu/z80.js //
    //////////////////////////////////////////////////////////////////////
    const Z80Instr = {
        set: {
            // 0 nebo 1 parametr
            //         0     1     2       3      4      5     6       7      8      9     10    11     12    13
            //         0 /  /A,r/ A,N /   R8  /   N   / R16 / R16A /  POP   COND /  IMM /  RST /  REL  / ABS / (HL)
            //		ADC: [    -1,    -1,  0x88,  0xce,    -1,    -1,    -1,    -1,    -1,    -1,    -1,    -1,    -1,    -1],
            DEC: [-1, -1, -1, -1, 0x05, -1, 0x0b, -1, -1, -1, -1, -1, -1, -1],
            INC: [-1, -1, -1, -1, 0x04, -1, 0x03, -1, -1, -1, -1, -1, -1, -1],
            AND: [-1, -1, -1, -1, 0xa0, 0xe6, -1, -1, -1, -1, -1, -1, -1, -1],
            OR: [-1, -1, -1, -1, 0xb0, 0xf6, -1, -1, -1, -1, -1, -1, -1, -1],
            XOR: [-1, -1, -1, -1, 0xa8, 0xee, -1, -1, -1, -1, -1, -1, -1, -1],
            SUB: [-1, -1, -1, -1, 0x90, 0xd6, -1, -1, -1, -1, -1, -1, -1, -1],
            CP: [-1, -1, -1, -1, 0xb8, 0xfe, -1, -1, -1, -1, -1, -1, -1, -1],
            SLA: [-1, -1, -1, -1, 0xcb20, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            SRA: [-1, -1, -1, -1, 0xcb28, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            SLL: [-1, -1, -1, -1, 0xcb30, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            SRL: [-1, -1, -1, -1, 0xcb38, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            RR: [-1, -1, -1, -1, 0xcb18, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            RL: [-1, -1, -1, -1, 0xcb10, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            RRC: [-1, -1, -1, -1, 0xcb08, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            RLC: [-1, -1, -1, -1, 0xcb00, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            POP: [-1, -1, -1, -1, -1, -1, -1, 0xc1, -1, -1, -1, -1, -1, -1],
            PUSH: [-1, -1, -1, -1, -1, -1, -1, 0xc5, -1, -1, -1, -1, -1, -1],
            RET: [0xc9, -1, -1, -1, -1, -1, -1, -1, 0xc0, -1, -1, -1, -1, -1],
            IM: [-1, -1, -1, -1, -1, -1, -1, -1, -1, 0xed46, -1, -1, -1, -1],
            RST: [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0xc7, -1, -1, -1],
            CALL: [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0xcd, -1],
            JP: [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0xc3, 0xe9],
            DJNZ: [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0x10, -1, -1],
            JR: [-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, 0x18, -1, -1],
            NOP: [0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            CCF: [0x3f, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            CPD: [0xeda9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            CPDR: [0xedb9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            CPI: [0xeda1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            CPIR: [0xedb1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            CPL: [0x2f, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            DAA: [0x27, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            DI: [0xf3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            EI: [0xfb, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            EXX: [0xd9, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            IND: [0xedaa, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            INDR: [0xedba, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            INI: [0xeda2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            INIR: [0xedb2, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            LDD: [0xeda8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            LDDR: [0xedb8, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            LDI: [0xeda0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            LDIR: [0xedb0, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            OUTD: [0xedab, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            OTDR: [0xedbb, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            OUTI: [0xeda3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            OTIR: [0xedb3, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            HALT: [0x76, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            NEG: [0xed44, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            RETI: [0xed4d, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            RETN: [0xed45, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            RLA: [0x17, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            RLCA: [0x07, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            RLD: [0xed6f, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            RRA: [0x1f, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            RRCA: [0x0f, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            RRD: [0xed67, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
            SCF: [0x37, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1],
        },
        set2: {
            // two params
            //    0      1    2       3      4     5
            // a,r8 /   a,n/HL,r16/XX,r16/  b,r8/  c,ABS/
            EX: [0],
            LD: [0],
            ADC: [0x88, 0xce, 0xed4a],
            ADD: [0x80, 0xc6, 0x09, 0x09],
            SBC: [0x98, 0xde, 0xed42],
            BIT: [-1, -1, -1, -1, 0xcb40],
            RES: [-1, -1, -1, -1, 0xcb80],
            SET: [-1, -1, -1, -1, 0xcbc0],
            CAL2: [-1, -1, -1, -1, -1, 0xc4],
            JP2: [-1, -1, -1, -1, -1, 0xc2],
            JR2: [-1, -1, -1, -1, -1, 0x20],
            IN: [0xed40, 0xdb, -1, -1, -1, -1],
            OUT: [0xed41, 0xd3, -1, -1, -1, -1],
        },

        //r16 = BC, DE, HL, SP
        //r16a = BC, DE, HL, AF

        R8: {
            DEC: 3,
            INC: 3,
        },

        R16: {
            DEC: 4,
            INC: 4,
            POP: 4,
            PUSH: 4,
        },

        parseOpcode: function (s, vars, Parser) {
            var R8 = function (reg) {
                var n = ["B", "C", "D", "E", "H", "L", "~", "A"].indexOf(reg.toUpperCase());
                if (reg.toUpperCase() == "(HL)") return 6;
                return n;
            };
            var R8F = function (reg) {
                return ["B", "C", "D", "E", "H", "L", "F", "A"].indexOf(reg.toUpperCase());
            };
            var R16 = function (reg) {
                var n = ["BC", "DE", "HL", "SP"].indexOf(reg.toUpperCase());
                return n;
            };
            var R16IX = function (reg) {
                var n = ["BC", "DE", "IX", "SP"].indexOf(reg.toUpperCase());
                return n;
            };
            var R16IY = function (reg) {
                var n = ["BC", "DE", "IY", "SP"].indexOf(reg.toUpperCase());
                return n;
            };
            var R16A = function (reg) {
                var n = ["BC", "DE", "HL", "AF"].indexOf(reg.toUpperCase());
                return n;
            };
            var COND = function (reg) {
                var n = ["NZ", "Z", "NC", "C", "PO", "PE", "P", "M"].indexOf(reg.toUpperCase());
                return n;
            };
            var LINK = function (par) {
                if (par[0] == "(" && par[par.length - 1] == ")") {
                    return par.substr(1, par.length - 2);
                } else return null;
            };

            var indexes = function (par) {
                var disp = null;
                var prefix = null;
                var idx = par.replace(/\s/g, "").substr(0, 4).toUpperCase();

                if (idx == "(IX)") {
                    disp = "0";
                    prefix = 0xdd;
                    par = "(HL)";
                }
                if (idx == "(IX+") {
                    disp = par.substr(4, par.length - 5);
                    prefix = 0xdd;
                    par = "(HL)";
                }
                if (idx == "(IX-") {
                    disp = "-" + par.substr(4, par.length - 5);
                    prefix = 0xdd;
                    par = "(HL)";
                }
                if (idx == "(IY)") {
                    disp = "0";
                    prefix = 0xfd;
                    par = "(HL)";
                }
                if (idx == "(IY+") {
                    disp = par.substr(4, par.length - 5);
                    prefix = 0xfd;
                    par = "(HL)";
                }
                if (idx == "(IY-") {
                    disp = "-" + par.substr(4, par.length - 5);
                    prefix = 0xfd;
                    par = "(HL)";
                }
                if (idx == "IX") {
                    prefix = 0xdd;
                    par = "HL";
                }
                if (idx == "IY") {
                    prefix = 0xfd;
                    par = "HL";
                }
                if (idx == "IXL") {
                    prefix = 0xdd;
                    par = "L";
                }
                if (idx == "IXH") {
                    prefix = 0xdd;
                    par = "H";
                }
                if (idx == "IYL") {
                    prefix = 0xfd;
                    par = "L";
                }
                if (idx == "IYH") {
                    prefix = 0xfd;
                    par = "H";
                }
                //console.log(idx,par,disp,prefix)
                return [par, disp, prefix];
            };

            var ax = Z80Instr.set[s.opcode];
            var ax2 = Z80Instr.set2[s.opcode];
            var op = -1,
                bytes = 1,
                lens = [];
            var prefix = null,
                disp = null;
            var reg, param8, mode, idx;

            if (ax && !ax2) {
                if ((s.params ? s.params.length : 0) > 1) {
                    if (s.opcode !== "JP" && s.opcode !== "JR" && s.opcode !== "CALL") throw "One parameter needed";
                }
            }

            if (!ax && ax2) {
                ax = ax2;
                if ((s.params ? s.params.length : 0) !== 2) {
                    throw "Two parameters needed";
                }
            }

            if (ax) {
                if (!s.params || s.params.length === 0) {
                    //no parameters
                    op = ax[0];
                } else if (s.params.length == 1) {
                    var par = s.params[0];
                    idx = indexes(par);
                    par = idx[0];
                    disp = idx[1];
                    prefix = idx[2];
                    if (ax[11] > 0) {
                        //rel jump
                        s.bytes = 2;
                        s.lens = [];
                        s.lens[0] = ax[11];
                        s.lens[1] = function (vars) {
                            var lab = Parser.evaluate(par, vars);
                            var pc = vars._PC + 2;
                            var disp = lab - pc;
                            if (disp > 127) throw "Target is out of relative jump reach";
                            if (disp < -128) throw "Target is out of relative jump reach";
                            if (disp < 0) {
                                disp = 256 + disp;
                            }
                            return disp;
                        };
                        return s;
                    }

                    if (ax[12] > 0) {
                        //abs jump
                        s.lens = [];
                        if (par.toUpperCase() == "(HL)" && ax[13] > 0) {
                            if (!idx[2]) {
                                s.bytes = 1;
                                s.lens[0] = ax[13];
                            } else {
                                s.bytes = 2;
                                s.lens[0] = idx[2];
                                s.lens[1] = ax[13];
                            }
                            return s;
                        }
                        /*
              if (par.toUpperCase() =='(IX)' && ax[13]>0) {
                s.bytes = 2;
                s.lens[0] = 0xdd;
                s.lens[1] = ax[13];
                return s;
              }
              if (par.toUpperCase() =='(IY)' && ax[13]>0) {
                s.bytes = 2;
                s.lens[0] = 0xfd;
                s.lens[1] = ax[13];
                return s;
              }
              */
                        s.bytes = 3;
                        s.lens[0] = ax[12];
                        s.lens[1] = function (vars) {
                            return Parser.evaluate(par, vars);
                        };
                        s.lens[2] = null;
                        return s;
                    }
                    if (ax[9] > 0) {
                        //IM x
                        s.bytes = 2;
                        s.lens = [];
                        s.lens[0] = 0xed;
                        mode = Parser.evaluate(par);
                        switch (mode) {
                            case 0:
                                s.lens[1] = 0x46;
                                return s;
                            case 1:
                                s.lens[1] = 0x56;
                                return s;
                            case 2:
                                s.lens[1] = 0x5e;
                                return s;
                        }
                        throw "Invalid interrupt mode";
                    }
                    if (ax[10] > 0) {
                        //RST x
                        s.bytes = 1;
                        s.lens = [];
                        mode = Parser.evaluate(par);
                        switch (mode) {
                            case 0x00:
                                s.lens[0] = 0xc7;
                                return s;
                            case 0x08:
                                s.lens[0] = 0xcf;
                                return s;
                            case 0x10:
                                s.lens[0] = 0xd7;
                                return s;
                            case 0x18:
                                s.lens[0] = 0xdf;
                                return s;
                            case 0x20:
                                s.lens[0] = 0xe7;
                                return s;
                            case 0x28:
                                s.lens[0] = 0xef;
                                return s;
                            case 0x30:
                                s.lens[0] = 0xf7;
                                return s;
                            case 0x38:
                                s.lens[0] = 0xff;
                                return s;
                        }
                        throw "Invalid RST";
                    }

                    reg = COND(par);
                    if (reg >= 0 && ax[8] > 0) {
                        op = ax[8];
                        if (op > 0) {
                            op += reg << 3;
                        }
                    } else {
                        reg = R16(par);
                        if (reg >= 0 && ax[6] >= 0) {
                            //instr R16
                            op = ax[6];
                            if (op > 0) {
                                if (Z80Instr.R16[s.opcode]) {
                                    op += reg << Z80Instr.R16[s.opcode];
                                } else {
                                    op += reg;
                                }
                            }
                        } else {
                            reg = R16A(par);
                            if (reg >= 0 && ax[7] >= 0) {
                                //instr R16
                                op = ax[7];
                                if (op > 0) {
                                    if (Z80Instr.R16[s.opcode]) {
                                        op += reg << Z80Instr.R16[s.opcode];
                                    } else {
                                        op += reg;
                                    }
                                }
                            } else {
                                reg = R8(par);
                                if (reg >= 0 && ax[4] > 0) {
                                    // INSTR R8
                                    op = ax[4];
                                    //console.log(par, op, reg, s)
                                    if (op > 0) {
                                        if (Z80Instr.R8[s.opcode]) {
                                            op += reg << Z80Instr.R8[s.opcode];
                                        } else {
                                            op += reg;
                                        }
                                    }
                                } else {
                                    op = ax[5];
                                    param8 = function (vars) {
                                        return Parser.evaluate(par, vars);
                                    };
                                }
                            }
                        }
                    }
                } else if (s.params.length == 2) {
                    var par1 = s.params[0];
                    var par2 = s.params[1];
                    //var idx;

                    //console.log(s,ax)

                    //speciality

                    //instrukce EX
                    if (s.opcode == "EX") {
                        if (par1.toUpperCase() == "DE" && par2.toUpperCase() == "HL") {
                            s.lens = [0xeb];
                            s.bytes = 1;
                            return s;
                        }
                        if (par1.toUpperCase() == "AF" && par2.toUpperCase() == "AF'") {
                            s.lens = [0x08];
                            s.bytes = 1;
                            return s;
                        }
                        if (par1.toUpperCase() == "(SP)" && par2.toUpperCase() == "HL") {
                            s.lens = [0xe3];
                            s.bytes = 1;
                            return s;
                        }
                        if (par1.toUpperCase() == "(SP)" && par2.toUpperCase() == "IX") {
                            s.lens = [0xdd, 0xe3];
                            s.bytes = 2;
                            return s;
                        }
                        if (par1.toUpperCase() == "(SP)" && par2.toUpperCase() == "IY") {
                            s.lens = [0xfd, 0xe3];
                            s.bytes = 2;
                            return s;
                        }

                        return null;
                    }
                    if (s.opcode == "CALL") {
                        ax = Z80Instr.set2.CAL2;
                        reg = COND(par1);
                        if (reg >= 0 && ax[5] > 0) {
                            op = ax[5];
                            if (op > 0) {
                                op += reg << 3;
                                s.bytes = 3;
                                s.lens = [];
                                s.lens[0] = op;
                                s.lens[1] = function (vars) {
                                    return Parser.evaluate(par2, vars);
                                };
                                s.lens[2] = null;
                                return s;
                            }
                        }
                        return null;
                    }
                    if (s.opcode == "JP") {
                        ax = Z80Instr.set2.JP2;
                        reg = COND(par1);
                        if (reg >= 0 && ax[5] > 0) {
                            op = ax[5];
                            if (op > 0) {
                                op += reg << 3;
                                s.bytes = 3;
                                s.lens = [];
                                s.lens[0] = op;
                                s.lens[1] = function (vars) {
                                    return Parser.evaluate(par2, vars);
                                };
                                s.lens[2] = null;
                                return s;
                            }
                        }
                        return null;
                    }
                    if (s.opcode == "JR") {
                        ax = Z80Instr.set2.JR2;
                        reg = COND(par1);
                        if (reg >= 0 && reg < 4 && ax[5] > 0) {
                            op = ax[5];
                            if (op > 0) {
                                op += reg << 3;
                                s.bytes = 2;
                                s.lens = [];
                                s.lens[0] = op;
                                s.lens[1] = function (vars) {
                                    var lab = Parser.evaluate(par2, vars);
                                    var pc = vars._PC + 2;
                                    var disp = lab - pc;
                                    if (disp > 127) throw "Target is out of relative jump reach";
                                    if (disp < -128) throw "Target is out of relative jump reach";
                                    if (disp < 0) {
                                        disp = 256 + disp;
                                    }
                                    return disp;
                                };
                                return s;
                            }
                        }
                        return null;
                    }

                    if (s.opcode == "IN") {
                        if (par2.toUpperCase() == "(C)") {
                            reg = R8F(par1);
                            if (reg >= 0 && ax[0]) {
                                s.lens = [0xed, 0x40 + (reg << 3)];
                                s.bytes = 2;
                                return s;
                            }
                        }
                        if (par1.toUpperCase() == "A") {
                            s.lens = [ax[1]];
                            s.lens[1] = function (vars) {
                                return Parser.evaluate(par2, vars);
                            };
                            s.bytes = 2;
                            return s;
                        }
                        return null;
                    }
                    if (s.opcode == "OUT") {
                        if (par1.toUpperCase() == "(C)") {
                            reg = R8F(par2);
                            if (reg >= 0 && ax[0]) {
                                s.lens = [0xed, 0x41 + (reg << 3)];
                                s.bytes = 2;
                                return s;
                            }
                        }
                        if (par2.toUpperCase() == "A") {
                            s.lens = [ax[1]];
                            s.lens[1] = function (vars) {
                                return Parser.evaluate(par1, vars);
                            };
                            s.bytes = 2;
                            return s;
                        }
                        return null;
                    }

                    if (s.opcode == "LD") {
                        //MASAKR
                        //

                        if (par1.toUpperCase() == "A" && par2.toUpperCase() == "R") {
                            s.bytes = 2;
                            s.lens = [0xed, 0x5f];
                            return s;
                        }
                        if (par1.toUpperCase() == "A" && par2.toUpperCase() == "I") {
                            s.bytes = 2;
                            s.lens = [0xed, 0x57];
                            return s;
                        }
                        if (par1.toUpperCase() == "R" && par2.toUpperCase() == "A") {
                            s.bytes = 2;
                            s.lens = [0xed, 0x4f];
                            return s;
                        }
                        if (par1.toUpperCase() == "I" && par2.toUpperCase() == "A") {
                            s.bytes = 2;
                            s.lens = [0xed, 0x47];
                            return s;
                        }

                        //Syntaktic sugar
                        if (par1.toUpperCase() == "HL" && par2.toUpperCase() == "DE") {
                            s.bytes = 2;
                            s.lens = [0x62, 0x6b];
                            return s;
                        }
                        if (par1.toUpperCase() == "HL" && par2.toUpperCase() == "BC") {
                            s.bytes = 2;
                            s.lens = [0x60, 0x69];
                            return s;
                        }
                        if (par1.toUpperCase() == "DE" && par2.toUpperCase() == "HL") {
                            s.bytes = 2;
                            s.lens = [0x54, 0x5d];
                            return s;
                        }
                        if (par1.toUpperCase() == "DE" && par2.toUpperCase() == "BC") {
                            s.bytes = 2;
                            s.lens = [0x50, 0x59];
                            return s;
                        }
                        if (par1.toUpperCase() == "BC" && par2.toUpperCase() == "HL") {
                            s.bytes = 2;
                            s.lens = [0x44, 0x4d];
                            return s;
                        }
                        if (par1.toUpperCase() == "BC" && par2.toUpperCase() == "DE") {
                            s.bytes = 2;
                            s.lens = [0x42, 0x4b];
                            return s;
                        }

                        var idx1 = indexes(par1);
                        par1 = idx1[0];
                        disp = idx1[1];
                        prefix = idx1[2];
                        var idx2 = indexes(par2);
                        par2 = idx2[0];
                        if (idx2[1] && disp) {
                            throw "Invalid parameters - two indexed";
                        }
                        if (idx2[1]) disp = idx2[1];
                        if (idx2[2] && prefix) {
                            throw "Invalid parameters - two prefixed";
                        }
                        if (idx2[2]) prefix = idx2[2];
                        var reg1 = R8(par1);
                        var reg2 = R8(par2);
                        lens = [];
                        //console.log(reg1,reg2,par1,par2,disp,prefix);
                        if (reg1 >= 0 && reg2 >= 0) {
                            //ld r8,r8
                            s.bytes = 1;
                            lens[0] = 0x40 + (reg1 << 3) + reg2;
                        }
                        if (par1.toUpperCase() == "A" && par2.toUpperCase() == "(BC)") {
                            s.bytes = 1;
                            s.lens = [0x0a];
                            return s;
                        }
                        if (par1.toUpperCase() == "A" && par2.toUpperCase() == "(DE)") {
                            s.bytes = 1;
                            s.lens = [0x1a];
                            return s;
                        }
                        if (par1.toUpperCase() == "A" && LINK(par2) && s.bytes === 0) {
                            s.bytes = 3;
                            s.lens = [
                                0x3a,
                                function (vars) {
                                    return Parser.evaluate(LINK(par2), vars);
                                },
                                null,
                            ];
                            return s;
                        }
                        if (par1.toUpperCase() == "(BC)" && par2.toUpperCase() == "A") {
                            s.bytes = 1;
                            s.lens = [0x02];
                            return s;
                        }
                        if (par1.toUpperCase() == "(DE)" && par2.toUpperCase() == "A") {
                            s.bytes = 1;
                            s.lens = [0x12];
                            return s;
                        }
                        if (LINK(par1) && par2.toUpperCase() == "A" && s.bytes === 0) {
                            s.bytes = 3;
                            s.lens = [
                                0x32,
                                function (vars) {
                                    return Parser.evaluate(LINK(par1), vars);
                                },
                                null,
                            ];
                            return s;
                        }

                        // FIX 6.4.2015 - LD A,(0123)
                        //

                        if (reg1 == 7 && reg2 < 0 && par2[0] == "(") {
                            s.bytes = 3;
                            lens[0] = 0x3a;
                            lens[1] = function (vars) {
                                return Parser.evaluate(par2, vars);
                            };
                            lens[2] = null;
                            return s;
                        }

                        if (reg1 >= 0 && reg2 < 0 && par2[0] == "(") {
                            //ld c,(1234)
                            throw "Invalid combination: general register and memory";
                        }

                        if (reg1 >= 0 && reg2 < 0) {
                            //ld r8,n
                            s.bytes = 2;
                            lens[0] = 0x06 + (reg1 << 3);
                            lens[1] = function (vars) {
                                return Parser.evaluate(par2, vars);
                            };
                        }

                        //16bit
                        if (s.bytes === 0) {
                            reg1 = R16(par1);
                            reg2 = R16(par2);
                            var link1 = LINK(par1);
                            var link2 = LINK(par2);
                            //console.log(reg1,reg2,par1,par2,disp,prefix, link1, link2);
                            if (reg1 >= 0 && !link2) {
                                s.bytes = 3;
                                lens = [
                                    0x01 + (reg1 << 4),
                                    function (vars) {
                                        return Parser.evaluate(par2, vars);
                                    },
                                    null,
                                ];
                                //return s;
                            }
                            if (reg1 >= 0 && link2) {
                                s.bytes = [4, 4, 3, 4][reg1];
                                lens = [
                                    0xed,
                                    0x4b + (reg1 << 4),
                                    function (vars) {
                                        return Parser.evaluate(link2, vars);
                                    },
                                    null,
                                ];
                                if (s.bytes == 3) {
                                    lens = [
                                        0x2a,
                                        function (vars) {
                                            return Parser.evaluate(link2, vars);
                                        },
                                        null,
                                    ];
                                }
                                //return s;
                            }
                            if (link1 && reg2 >= 0) {
                                s.bytes = [4, 4, 3, 4][reg2];
                                lens = [
                                    0xed,
                                    0x43 + (reg2 << 4),
                                    function (vars) {
                                        return Parser.evaluate(link1, vars);
                                    },
                                    null,
                                ];
                                if (s.bytes == 3) {
                                    lens = [
                                        0x22,
                                        function (vars) {
                                            return Parser.evaluate(link1, vars);
                                        },
                                        null,
                                    ];
                                }
                                //return s;
                            }

                            if (reg1 == 3 && reg2 == 2) {
                                s.bytes = 1;
                                lens = [0xf9];
                            }
                        }

                        //kontrola
                        if (!lens.length) return null;
                        if (prefix) {
                            lens.unshift(prefix);
                            s.bytes++;
                        }
                        if (disp) {
                            if (s.bytes == 3) {
                                lens[3] = lens[2];
                                lens[2] = function (vars) {
                                    var d = Parser.evaluate(disp, vars);
                                    if (d > 127 || d < -128) throw "Index out of range (" + d + ")";
                                    return d;
                                };
                                s.bytes = 4;
                            }
                            if (s.bytes == 2) {
                                //lens[2] = Parser.evaluate(disp,vars);
                                lens[2] = function (vars) {
                                    var d = Parser.evaluate(disp, vars);
                                    if (d > 127 || d < -128) throw "Index out of range (" + d + ")";
                                    return d;
                                };
                                s.bytes = 3;
                            }
                        }
                        s.lens = lens;
                        //console.log(s);
                        return s;
                    }

                    if (ax[4] >= 0) {
                        //BIT etc.
                        var bit = parseInt(par1, 10);
                        idx = indexes(par2);
                        par2 = idx[0];
                        disp = idx[1];
                        prefix = idx[2];
                        reg = R8(par2);
                        op = ax[4] + 8 * bit + reg;
                    }

                    if (par1.toUpperCase() == "A") {
                        //INS A,xxx
                        idx = indexes(par2);
                        par2 = idx[0];
                        disp = idx[1];
                        prefix = idx[2];

                        //A,r8
                        if ((reg = R8(par2)) >= 0) {
                            op = ax[0] + reg;
                        } else {
                            //A,n
                            op = ax[1];
                            param8 = function (vars) {
                                return Parser.evaluate(par2, vars);
                            };
                        }
                    }
                    if (par1.toUpperCase() == "IX") {
                        //XX,r16 (<<4)
                        if ((reg = R16IX(par2)) >= 0) {
                            op = ax[2] + (reg << 4);
                            prefix = 0xdd;
                        }
                    }
                    if (par1.toUpperCase() == "IY") {
                        //XX,r16 (<<4)
                        if ((reg = R16IY(par2)) >= 0) {
                            op = ax[2] + (reg << 4);
                            prefix = 0xfd;
                        }
                    }

                    if (par1.toUpperCase() == "HL") {
                        //HL,r16 (<<4)
                        if ((reg = R16(par2)) >= 0) {
                            op = ax[2] + (reg << 4);
                        }
                    }
                }

                if (op < 0) {
                    throw "Bad addressing mode at line " + s.numline;
                }
                if (op > 255) {
                    //prefixed
                    bytes++;
                    lens[0] = (op & 0xff00) >> 8;
                    lens[1] = op & 0xff;
                } else {
                    lens[0] = op & 0xff;
                }

                var safeparse = function (d) {
                    try {
                        if (!vars) vars = {};
                        return Parser.evaluate(d, vars);
                    } catch (e) {
                        //console.log(e)
                        return null;
                    }
                };
                //console.log(lens, bytes, prefix,disp)

                if (prefix) {
                    lens.unshift(prefix);
                    bytes++;
                }
                if (disp !== null && disp !== undefined) {
                    if (bytes == 3) {
                        lens[3] = lens[2];
                        //lens[2] = safeparse(disp);
                        lens[2] = (vars) => {
                            var d = Parser.evaluate(disp, vars);
                            if (d > 127 || d < -128) throw "Index out of range (" + d + ")";
                            return d;
                        };
                        bytes = 4;
                    }
                    if (bytes == 2) {
                        //          lens[2] = safeparse(disp);
                        lens[2] = (vars) => {
                            var d = Parser.evaluate(disp, vars);
                            if (d > 127 || d < -128) throw "Index out of range (" + d + ")";
                            return d;
                        };
                        bytes = 3;
                    }
                }

                if (param8) {
                    lens.push(param8);
                    bytes++;
                }
                s.lens = lens;
                s.bytes = bytes;
                //console.log(s);
                return s;
            }
            return null;
        },
    };

    //////////////////////////////////////////////////////////////////////////////////
    // origin: https://github.com/asm80/asm80-core/blob/main/utils/base64escaped.js //
    //////////////////////////////////////////////////////////////////////////////////
    const btoax = (str) => btoa(unescape(encodeURIComponent(str)));
    const atobx = (str) => decodeURIComponent(escape(atob(str)));

    ///////////////////////////////////////////////////////////////////////
    // origin: https://github.com/asm80/asm80-core/blob/main/utils/fp.js //
    ///////////////////////////////////////////////////////////////////////
    const fptozx = (num, simpleint) => {
        simpleint = simpleint === undefined ? true : simpleint;
        let sgn = num < 0;
        let m = sgn ? -num : num;
        if (simpleint && num == Math.floor(num) && num >= -65535 && num <= 65535) {
            m = sgn ? 65536 + num : num;
            return [0, sgn ? 0xff : 0, m & 0xff, (m >> 8) & 0xff, 0];
        }
        let bit32 = function (m, sgn) {
            let out = "";
            let a = [];
            for (let i = 0; i < 32; i++) {
                let bit = "0";
                m = m * 2;
                if (m >= 1.0) {
                    m -= 1.0;
                    bit = "1";
                }
                if (sgn && i === 0) bit = "1";
                if (!sgn && i === 0) bit = "0";
                out += bit;
                if (i % 8 == 7) {
                    //console.log(parseInt(out,2))
                    a.push(parseInt(out, 2));
                    out = "";
                }
            }
            return a;
        };
        let e = Math.floor(Math.log2(m) + 1);
        if (e > 127) throw new Error("Overflow");
        if (e < -127) return [0, 0, 0, 0, 0];
        let i;
        if (e < 0) {
            for (i = 0; i < -e; i++) m = m * 2;
        } else {
            for (i = 0; i < e; i++) m = m / 2;
        }
        let n = bit32(m, sgn);
        return [e + 128, n[0], n[1], n[2], n[3]];
    };

    //////////////////////////////////////////////////////////////////////////
    // origin: https://github.com/asm80/asm80-core/blob/main/utils/utils.js //
    //////////////////////////////////////////////////////////////////////////
    const norm = (xs) =>
        xs.map((lx) => {
            let l = lx.line;
            l = l.replace("&lt;", "<");
            l = l.replace("&gt;", ">");
            while (l[l.length - 1] == " ") {
                l = l.substr(0, l.length - 1);
            }
            lx.line = l;
            if (l[0] != " ") {
                return lx;
            }
            while (l[0] == " ") {
                l = l.substr(1);
            }
            lx.line = " " + l;
            return lx;
        });

    //remove empty lines
    const nonempty = (xs) =>
        xs.filter((lx) => {
            let l = lx.line;
            while (l[0] == " ") {
                l = l.substr(1);
            }
            return l.length ? true : false;
        });

    //convert lines to internal structure

    const toInternal = (xs) => {
        let numLine = 1;
        return xs.map((line) => ({
            line: line, //original line
            numline: numLine++, //line number
            addr: null, //address in code
            bytes: 0, //number of bytes of this instruction
        }));
    };

    const toHexN = (n, d) => {
        let s = n.toString(16);
        while (s.length < d) {
            s = "0" + s;
        }
        return s.toUpperCase();
    };

    const toHex2 = (n) => toHexN(n & 0xff, 2);
    const toHex4 = (n) => toHexN(n, 4);
    const toHex6 = (n) => toHexN(n, 6);
    const toHex8 = (n) => toHexN(n, 8);

    this.compile = compile;
    this.Z80Instr = Z80Instr;
    this.returnAs = returnAs;
}
