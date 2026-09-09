/*
 * Filesystem quirk workaround.
 *
 * On some Windows volumes, fs.readlink() on a REGULAR (non-symlink) file returns
 * EISDIR instead of the POSIX-standard EINVAL. Next.js's build-time module tracing
 * ("Collecting page data") treats any non-EINVAL/ENOENT error from readlink as
 * fatal, so the build crashes with:
 *   EISDIR: illegal operation on a directory, readlink 'node_modules/styled-jsx/index.js'
 *
 * This preload normalises that specific bogus EISDIR to EINVAL (only when the
 * target is confirmed not to be a symlink), which is exactly what callers expect.
 * Load with:  NODE_OPTIONS="-r ./scripts/fs-readlink-shim.cjs"
 */
"use strict";
const fs = require("fs");

function makeEINVAL(p) {
  const err = new Error(
    `EINVAL: invalid argument, readlink '${typeof p === "string" ? p : String(p)}'`,
  );
  err.code = "EINVAL";
  err.errno = -4071;
  err.syscall = "readlink";
  if (typeof p === "string") err.path = p;
  return err;
}

function notSymlink(p) {
  try {
    return !fs.lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

const realSync = fs.readlinkSync.bind(fs);
fs.readlinkSync = function (path, options) {
  try {
    return realSync(path, options);
  } catch (e) {
    if (e && e.code === "EISDIR" && notSymlink(path)) throw makeEINVAL(path);
    throw e;
  }
};

const realCb = fs.readlink.bind(fs);
fs.readlink = function (path, options, callback) {
  const cb = typeof options === "function" ? options : callback;
  const opts = typeof options === "function" ? undefined : options;
  realCb(path, opts, (e, result) => {
    if (e && e.code === "EISDIR" && notSymlink(path)) return cb(makeEINVAL(path));
    cb(e, result);
  });
};

if (fs.promises && fs.promises.readlink) {
  const realP = fs.promises.readlink.bind(fs.promises);
  fs.promises.readlink = async function (path, options) {
    try {
      return await realP(path, options);
    } catch (e) {
      if (e && e.code === "EISDIR" && notSymlink(path)) throw makeEINVAL(path);
      throw e;
    }
  };
}
