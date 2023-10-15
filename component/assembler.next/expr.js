parse: function (e) {
    (this.errormsg = ""), (this.success = !0);
    var s = [],
        o = [];
    this.tmpprio = 0;
    var i = 77,
        a = 0;
    for (this.expression = e, this.pos = 0; this.pos < this.expression.length;) {
        if (this.isNumber()) {
            0 == (1 & i) &&
            this.error_parsing(this.pos, "unexpected number"),
            (l = new Token(I, 0, 0, this.tokennumber)),
            o.push(l),
            (i = 50);
        } else if (this.isOperator()) {
            this.isSign() && 64 & i
            ? (this.isNegativeSign() &&
                  ((this.tokenprio = 2),
                  (this.tokenindex = "-"),
                  a++,
                  this.addfunc(o, s, R)),
              (i = 77))
            : this.isComment() ||
                (0 == (2 & i) &&
                    this.error_parsing(
                        this.pos,
                        "unexpected operator",
                    ),
                (a += 2),
                this.addfunc(o, s, N),
                (i = 77));
        } else if (this.isString()) {
            0 == (1 & i) &&
            this.error_parsing(this.pos, "unexpected string"),
            (l = new Token(I, 0, 0, this.tokennumber)),
            o.push(l),
            (i = 50);
        } else if (this.isLeftParenth()) {
            0 == (8 & i) &&
            this.error_parsing(this.pos, 'unexpected "("'),
            128 & i &&
                ((a += 2),
                (this.tokenprio = -2),
                (this.tokenindex = -1),
                this.addfunc(o, s, _)),
            (i = 333);
        } else if (this.isRightParenth()) {
            if (256 & i) {
                var l = new Token(I, 0, 0, []);
                o.push(l);
            } else
                0 == (16 & i) &&
                    this.error_parsing(this.pos, 'unexpected ")"');
            i = 186;
        } else if (this.isComma()) {
            0 == (32 & i) &&
            this.error_parsing(this.pos, 'unexpected ","'),
            this.addfunc(o, s, N),
            (a += 2),
            (i = 77);
        } else if (this.isConst()) {
            0 == (1 & i) &&
                this.error_parsing(this.pos, "unexpected constant");
            var p = new Token(I, 0, 0, this.tokennumber);
            o.push(p), (i = 50);
        } else if (this.isOp2()) {
            0 == (4 & i) &&
            this.error_parsing(this.pos, "unexpected function"),
            this.addfunc(o, s, N),
            (a += 2),
            (i = 8);
        } else if (this.isOp1()) {
            0 == (4 & i) &&
            this.error_parsing(this.pos, "unexpected function"),
            this.addfunc(o, s, R),
            a++,
            (i = 8);
        } else if (this.isVar()) {
            0 == (1 & i) &&
                this.error_parsing(this.pos, "unexpected variable");
            var u = new Token(k, this.tokenindex, 0, 0);
            o.push(u), (i = 186);
        } else {
            this.isWhite() ||
                ("" === this.errormsg
                ? this.error_parsing(this.pos, "unknown character in " + this.expression)
                : this.error_parsing(this.pos, this.errormsg));
        }
    }

    for (
        (this.tmpprio < 0 || this.tmpprio >= 10) &&
        this.error_parsing(this.pos, 'unmatched "()"');
        s.length > 0;
    ) {
        var h = s.pop();
        o.push(h);
    }
    return (
        a + 1 !== o.length && this.error_parsing(this.pos, "parity"),
        new n(o, t(this.ops1), t(this.ops2), t(this.functions))
    );
}