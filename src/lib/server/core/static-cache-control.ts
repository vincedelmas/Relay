export const getStaticCacheControl = (pathname: string) => {
    const isVersioned = /^\/assets\/[^/]+-[\w-]{8}\.[^/]+$/.test(pathname);
    return isVersioned ? "public, max-age=31536000, immutable" : "no-cache";
};
