const fs = require('fs');

module.exports.util = {}

module.exports.util.hasOwnPropertyCaseInsensitive = function (obj, property) {
    var props = [];
    for (var i in obj) if (obj.hasOwnProperty(i)) props.push(i);
    var prop;
    while (prop = props.pop()) if (prop.toLowerCase() === property.toLowerCase()) return true;
    return false;
}

module.exports.util.getFileSizeInBytes = function (filename) {
    var stats = fs.statSync(filename);
    var fileSizeInBytes = stats.size;
    return fileSizeInBytes;
}