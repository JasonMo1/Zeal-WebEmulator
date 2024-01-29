Storage.prototype.setObj = function (key, value) {
    this.setItem(key, JSON.stringify(value));
};

Storage.prototype.getObj = function (key) {
    return JSON.parse(this.getItem(key));
};