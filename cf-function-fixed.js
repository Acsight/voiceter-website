function handler(event) {
    var request = event.request;
    var uri = request.uri;
    
    // Don't modify root path - let DefaultRootObject handle it
    if (uri === '/') {
        return request;
    }
    
    // Don't modify paths that already have extensions
    if (uri.includes('.')) {
        return request;
    }
    
    // Don't modify _next paths (Next.js assets)
    if (uri.startsWith('/_next')) {
        return request;
    }
    
    // Add .html extension to clean URLs
    request.uri = uri + '.html';
    
    return request;
}
