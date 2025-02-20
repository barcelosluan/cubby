'use strict';

const assert = require('assert'),
    fs = require('fs'),
    crypto = require('crypto'),
    constants = require('./constants.js'),
    preview = require('./preview.js');

exports = module.exports = Entry;

function Entry({ fullFilePath, filePath, fileName, owner, size = 0, mtime = new Date(), isDirectory, isFile, mimeType, files = [], sharedWith = [], share = null }) {
    assert(fullFilePath && typeof fullFilePath === 'string');
    assert(filePath && typeof filePath === 'string');
    assert(owner && typeof owner === 'string');
    assert(typeof fileName === 'string');
    assert.strictEqual(typeof size, 'number');
    assert(mtime instanceof Date && !isNaN(mtime.valueOf()));
    assert.strictEqual(typeof isDirectory, 'boolean');
    assert(mimeType && typeof mimeType === 'string');
    assert(Array.isArray(sharedWith));
    assert.strictEqual(typeof share, 'object');

    // TODO check that files is an array of Entries

    this._fullFilePath = fullFilePath;
    this.fileName = fileName;
    this.filePath = filePath;
    this.owner = owner;
    this.size = size;
    this.mtime = mtime;
    this.isDirectory = isDirectory;
    this.isFile = isFile;
    this.mimeType = mimeType;
    this.files = files;
    this.sharedWith = sharedWith;
    this.share = share;
}

Entry.prototype.asShare = function (shareFilePath) {
    var result = this;

    result.files = result.files.map(function (f) { return f.asShare(shareFilePath); });
    result.filePath = result.filePath.slice(shareFilePath.length);

    return result;
};

Entry.prototype.getPreviewUrl = function () {
    if (!this.mimeType) return '';
    if (this.mimeType === 'inode/recent') return '/folder-temp.svg';
    if (this.mimeType === 'inode/share') return '/folder-network.svg';

    const previewHash = preview.getHash(this.mimeType, this._fullFilePath);
    if (previewHash) {
        const type = this.share ? 'shares' : 'files';
        const ownerId = this.share ? this.share.id : this.owner;
        return `/api/v1/preview/${type}/${ownerId}/${previewHash}`;
    }

    var mime = this.mimeType.split('/');
    var previewUrl = '/mime-types/' + mime[0] + '-' + mime[1] + '.svg';

    if (fs.existsSync(constants.FRONTEND_ROOT + previewUrl)) return previewUrl;

    previewUrl = '/mime-types/' + mime[0] + '-x-generic.svg';
    if (fs.existsSync(constants.FRONTEND_ROOT + previewUrl)) return previewUrl;
    else return '';
};

Entry.prototype.withoutPrivate = function () {
    return {
        id: crypto.createHash('sha1').update(this.owner + this.filePath).digest('base64'),
        fileName: this.fileName,
        filePath: this.filePath,
        owner: this.owner,
        size: this.size,
        mtime: this.mtime,
        isDirectory: this.isDirectory,
        isFile: this.isFile,
        mimeType: this.mimeType,
        files: this.files.map(function (f) { return f.withoutPrivate(); }),
        share: this.share,
        sharedWith: this.sharedWith || [],
        previewUrl: this.getPreviewUrl()
    };
};
