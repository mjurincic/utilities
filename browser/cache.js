/**
 * A web worker that caches network responses for the specified files, and preferably returns assets from the cache rather than the network for future responses, with a network fallback if the item is unavailable in the cache.
 */

// The name of the cache
const cacheName = `cache-name`;

// The list of files to cache
const files = [
  `/`,
];

// add the files in the "files" array to the cache
const addFiles = cache => cache.addAll(files.map(file => new Request(file, { mode: `cors` })));

// cache a network response
const cacheNetworkResponse = async (req, res) => {
  const clonedResponse = res.clone();
  const cache          = await caches.open(cacheName);
  await cache.put(req, clonedResponse);
  return res;
};

// retrieve and cache the network response, or return an error response
const getNetworkResponse = async req => {
  try {
    const res = await fetch(req);
    return cacheNetworkResponse(req, res);
  } catch (e) {
    return new Response(``, {
      status:     503,
      statusText: `Service Unavailable`,
    });
  }
};

// retrieve either the cached or network response (whichever is available)
// 1. simultaneously start requests to cache and network
// 2. return cached response if found, network response otherwise
const getCacheOrNetworkResponse = async req => await caches.match(req) || getNetworkResponse(req);

// remove any files from the cache that aren`t listed in the "files" array
const removeFiles = async cache => {
  const keys = await cache.keys();
  return Promise.all(keys.map(request => {
    if (!files.some(file => request.url.endsWith(file))) return cache.delete(request);
    return Promise.resolve();
  }));
};

// wait until unnecessary files are removed before activating
self.addEventListener(`activate`, ev => {
  ev.waitUntil(caches.open(cacheName).then(removeFiles).catch(console.error));
});

// wait to install the worker until all files have been cached
self.addEventListener(`install`, ev => {
  ev.waitUntil(caches.open(cacheName).then(addFiles).catch(console.error));
});

// intercept server requests: return cached files first, but update cached files from network in the background
self.addEventListener(`fetch`, ev => {
  const req = ev.request;
  if (req.method !== `GET`) return ev.respondWith(fetch(req));
  return ev.respondWith(getCacheOrNetworkResponse(req));
});
