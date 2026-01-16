function handler(event) {
    var request = event.request;
    var uri = request.uri;
    
    // If URI doesn't have an extension and doesn't end with /
    if (!uri.includes('.') && !uri.endsWith('/')) {
        request.uri = uri + '.html';
    }
    // If URI ends with / add index.html
    else if (uri.endsWith('/')) {
        request.uri = uri + 'index.html';
    }
    
    return request;
}
